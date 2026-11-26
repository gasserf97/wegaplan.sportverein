import { headers } from "next/headers";
import Stripe from "stripe";
import { parsePhone } from "@/lib/profile";

export function cleanStripeEnv(value: string | undefined | null) {
  return (value ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

export function isPlaceholderStripeKey(key: string) {
  return (
    key.length < 20 ||
    /\.{3}|your.?secret|changeme|placeholder|xxx+/i.test(key)
  );
}

/** Secret Key (sk_…) oder Restricted Key (rk_…) – Test und Live. */
export function isValidStripeSecretKey(key: string) {
  const cleaned = cleanStripeEnv(key);
  if (!cleaned || isPlaceholderStripeKey(cleaned)) return false;
  return /^(sk|rk)_(test|live)_/.test(cleaned);
}

/**
 * Vorführung ohne echten Stripe-Schlüssel: Checkout bleibt in der App und
 * akzeptiert nur die offizielle Testkarte. Liegt ein sk_test_/sk_live_-Schlüssel,
 * geht die Zahlung an dieses Stripe-Konto.
 */
export async function isStripeDemoMode() {
  const { clubShowcaseMode } = await import("@/lib/club-settings");
  const { listAllStripeSecretKeys } = await import("@/lib/section-payments");
  const { currentClubHasConnectAccount } = await import("@/lib/stripe-connect");
  if (await currentClubHasConnectAccount()) return false;
  const clubMode = await clubShowcaseMode();
  const keys = await listAllStripeSecretKeys();
  const hasRealKey = keys.some((key) => isValidStripeSecretKey(key));
  if (clubMode === true) return !hasRealKey;
  if (clubMode === false) return false;
  if (cleanStripeEnv(process.env.SHOWCASE_MODE) !== "1") return false;
  if (getGlobalStripeSecretKey()) return false;
  if (hasRealKey) return false;
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.endsWith("STRIPE_SECRET_KEY")) continue;
    if (isValidStripeSecretKey(value ?? "")) return false;
  }
  return true;
}

/** Globaler Env-Key (ohne Sektions-Override). */
export function getGlobalStripeSecretKey() {
  const key = cleanStripeEnv(process.env.STRIPE_SECRET_KEY);
  if (!key || isPlaceholderStripeKey(key)) return null;
  return key;
}

export function getGlobalStripeWebhookSecret() {
  const secret = cleanStripeEnv(process.env.STRIPE_WEBHOOK_SECRET);
  return secret || null;
}

/** @deprecated Prefer isSectionStripeConfigured(sectionId) */
export function getStripeSecretKey() {
  return getGlobalStripeSecretKey();
}

/** @deprecated Prefer isSectionStripeConfigured(sectionId) */
export function isStripeConfigured() {
  return Boolean(getGlobalStripeSecretKey());
}

export const stripeCheckoutUnavailableError =
  "Kartenzahlung ist für diesen Verein noch nicht eingerichtet. Bitte Überweisung wählen oder den Betreiber informieren.";

const cachedByKey = new Map<string, Stripe>();

export function getStripeWithKey(secretKey: string, stripeAccount?: string | null) {
  const key = cleanStripeEnv(secretKey);
  const account = cleanStripeEnv(stripeAccount);
  if (!key || isPlaceholderStripeKey(key)) {
    throw new Error("Stripe ist nicht konfiguriert.");
  }
  const cacheId = account ? `${key}\n${account}` : key;
  let client = cachedByKey.get(cacheId);
  if (!client) {
    client = new Stripe(key, account ? { stripeAccount: account } : undefined);
    cachedByKey.set(cacheId, client);
  }
  return client;
}

export async function hasStripeAccess() {
  const { anyConnectAccount } = await import("@/lib/stripe-connect");
  if (await anyConnectAccount()) return true;
  const { listAllStripeSecretKeys } = await import("@/lib/section-payments");
  return (await listAllStripeSecretKeys()).length > 0;
}

/** Stripe-Client; optional mit explizitem Secret. */
export function getStripe(secretKey?: string | null) {
  const key = secretKey ? cleanStripeEnv(secretKey) : getGlobalStripeSecretKey();
  if (!key || isPlaceholderStripeKey(key)) {
    throw new Error("Stripe ist nicht konfiguriert.");
  }
  return getStripeWithKey(key);
}

export async function getStripeForSection(sectionId: string | null | undefined) {
  const { connectAccountForSection, getConnectClient, sectionCardRail } = await import(
    "@/lib/stripe-connect"
  );
  const rail = await sectionCardRail(sectionId);
  if (rail === "connect") {
    const account = await connectAccountForSection(sectionId);
    return getConnectClient(account.accountId);
  }
  if (rail === "pending") {
    throw new Error(
      "Das Stripe-Konto des Vereins ist noch nicht für Kartenzahlungen freigeschaltet.",
    );
  }
  const { resolveSectionStripeSecretKey } = await import("@/lib/section-payments");
  let key = await resolveSectionStripeSecretKey(sectionId);
  if (!key && cleanStripeEnv(process.env.SHOWCASE_MODE) === "1") {
    key = getGlobalStripeSecretKey();
  }
  if (!key) {
    throw new Error("Stripe ist für diese Sektion nicht konfiguriert.");
  }
  return getStripeWithKey(key);
}

/**
 * Session oder Kunde laden: Connect-Konto des Vereins, danach Legacy-Schlüssel.
 */
export async function withStripeAccounts<T>(
  run: (stripe: Stripe) => Promise<T>,
): Promise<T> {
  const { stripeClientsForLookup } = await import("@/lib/stripe-connect");
  const clients = await stripeClientsForLookup();
  if (clients.length === 0) {
    throw new Error("Stripe ist nicht konfiguriert.");
  }

  let lastError: unknown;
  for (const client of clients) {
    try {
      return await run(client);
    } catch (error) {
      lastError = error;
      if (isWrongStripeAccountError(error)) {
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Stripe-Ressource in keinem Konto gefunden.");
}

/** Falsches Konto, ungültiger Key oder unbekannte Resource → nächsten Key versuchen. */
export function isWrongStripeAccountError(error: unknown) {
  const err = error as {
    code?: string;
    type?: string;
    message?: string;
    raw?: { code?: string; type?: string; message?: string };
  };
  const code = String(err.raw?.code || err.code || "");
  const type = String(err.raw?.type || err.type || "");
  const message = String(err.raw?.message || err.message || "");

  if (
    code === "resource_missing" ||
    code === "account_invalid" ||
    code === "api_key_invalid" ||
    type === "StripeAuthenticationError" ||
    type === "StripePermissionError"
  ) {
    return true;
  }

  return /no such (checkout\.session|customer|subscription|payment_intent|invoice|charge)|invalid api key|expired api key|does not have access/i.test(
    message,
  );
}

function isLocalHost(value: string) {
  return /localhost|127\.0\.0\.1/i.test(value);
}

function normalizeBaseUrl(raw: string) {
  const cleaned = cleanStripeEnv(raw).replace(/\/+$/, "");
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

export async function getAppUrl() {
  try {
    const headerList = await headers();
    const host = cleanStripeEnv(
      headerList.get("x-club-host") ??
        headerList.get("x-forwarded-host") ??
        headerList.get("host"),
    );
    if (host) {
      const local = isLocalHost(host);
      const proto = local
        ? "http"
        : cleanStripeEnv(headerList.get("x-forwarded-proto")) || "https";
      return `${proto}://${host}`;
    }
  } catch {
    // outside a request
  }

  const fromEnv = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || "",
  );
  if (fromEnv) return fromEnv;
  return "http://127.0.0.1:4521";
}

/** Stable public URL for links in e-mails (never localhost on Render). */
export function getPublicAppUrl() {
  const fromEnv = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || "",
  );
  if (fromEnv) return fromEnv;
  return "http://127.0.0.1:4521";
}

/** Stripe API 2024+ stores the subscription on invoice.parent, not invoice.subscription. */
export function stripeSubscriptionIdFromInvoice(invoice: {
  subscription?: unknown;
  parent?: {
    subscription_details?: {
      subscription?: unknown;
    } | null;
  } | null;
}): string | null {
  const pick = (value: unknown): string | null => {
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object" && "id" in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === "string" && id) return id;
    }
    return null;
  };
  return (
    pick(invoice.subscription) ??
    pick(invoice.parent?.subscription_details?.subscription)
  );
}

export function stripeCustomerEmail(email: string | null | undefined) {
  const value = email?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return {};
  if (/\.local$/i.test(value)) return {};
  return { customer_email: value };
}

function toStripePhone(phone: string) {
  return parsePhone(phone) ?? undefined;
}

export async function stripeCheckoutCustomer(
  input: {
    email: string;
    name: string;
    phone?: string | null;
  },
  stripeClient?: Stripe,
) {
  const stripe = stripeClient ?? getStripe();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone ? toStripePhone(input.phone) : undefined;

  const existing = await stripe.customers.list({ email, limit: 1 });
  const payload = {
    email,
    name,
    ...(phone ? { phone } : {}),
  };

  if (existing.data[0]) {
    return stripe.customers.update(existing.data[0].id, payload);
  }

  return stripe.customers.create(payload);
}

/** Stripe customer with profile phone; disables Link so a cached SMS number is not used. */
export async function stripeCheckoutSessionCustomer(
  input: {
    email: string;
    name: string;
    phone?: string | null;
  },
  stripeClient?: Stripe,
) {
  const customer = await stripeCheckoutCustomer(input, stripeClient);
  return {
    customer: customer.id,
    phone_number_collection: { enabled: true as const },
    customer_update: {
      name: "auto" as const,
      address: "auto" as const,
    },
    wallet_options: {
      link: {
        display: "never" as const,
      },
    },
  };
}

/** Guest checkout: collect phone on Stripe page, no Link cache. */
export function stripeGuestCheckoutOptions(email: string | null | undefined) {
  return {
    ...stripeCustomerEmail(email),
    phone_number_collection: { enabled: true as const },
    wallet_options: {
      link: {
        display: "never" as const,
      },
    },
  };
}

export function productDescription(text: string | null | undefined) {
  const value = text?.trim().slice(0, 240) ?? "";
  return value ? { description: value } : {};
}

export function formatStripeCheckoutError(error: unknown): string {
  const err = error as {
    type?: string;
    code?: string;
    message?: string;
    raw?: { message?: string; code?: string; type?: string };
  };
  const message = (err.raw?.message || err.message || "").trim();
  const code = err.raw?.code || err.code || "";
  const type = err.raw?.type || err.type || "";

  if (
    type === "StripeAuthenticationError" ||
    code === "api_key_invalid" ||
    /invalid api key/i.test(message)
  ) {
    return "Der Stripe-Geheimschlüssel ist ungültig. In Render PAYMENT_<KEY>_STRIPE_SECRET_KEY prüfen (sk_… / rk_…), ohne Anführungszeichen.";
  }

  if (/localhost|127\.0\.0\.1/i.test(message)) {
    return "Stripe lehnt die Rücksprung-URL ab. NEXT_PUBLIC_APP_URL in Render auf https://app.asclajen.com setzen und neu deployen.";
  }

  if (message) {
    return `Stripe hat die Zahlungsseite abgelehnt: ${message}`;
  }

  return "Die Zahlungsseite konnte nicht geöffnet werden. PAYMENT_<KEY>_STRIPE_SECRET_KEY und NEXT_PUBLIC_APP_URL in Render prüfen.";
}
