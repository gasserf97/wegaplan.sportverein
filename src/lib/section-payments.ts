import { formatIban } from "@/lib/bank-transfer";
import { prisma } from "@/lib/prisma";
import {
  cleanStripeEnv,
  isPlaceholderStripeKey,
  getGlobalStripeSecretKey,
  getGlobalStripeWebhookSecret,
  getPublicAppUrl,
  isStripeDemoMode,
} from "@/lib/stripe";

export type SectionBankDetails = {
  holder: string;
  iban: string;
  formattedIban: string;
  source: "section-env" | "global-env";
};

export type SectionStripeStatus = {
  secretConfigured: boolean;
  webhookConfigured: boolean;
  /** Kartenzahlung möglich (Secret gesetzt). */
  checkoutReady: boolean;
  /** Secret + Webhook sind gesetzt. */
  fullyReady: boolean;
  /** True, wenn der globale Fallback genutzt wird. */
  usingClubFallback: boolean;
};

const PAYMENT_ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export function normalizePaymentEnvKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 40);
}

export function isValidPaymentEnvKey(value: string) {
  return PAYMENT_ENV_KEY_PATTERN.test(value);
}

export function paymentEnvVarNames(paymentEnvKey: string | null | undefined) {
  const key = paymentEnvKey && isValidPaymentEnvKey(paymentEnvKey)
    ? paymentEnvKey
    : null;
  return {
    bankAccountHolder: key ? `PAYMENT_${key}_BANK_ACCOUNT_HOLDER` : "BANK_ACCOUNT_HOLDER",
    bankIban: key ? `PAYMENT_${key}_BANK_IBAN` : "BANK_IBAN",
    stripeSecretKey: key ? `PAYMENT_${key}_STRIPE_SECRET_KEY` : "STRIPE_SECRET_KEY",
    stripeWebhookSecret: key
      ? `PAYMENT_${key}_STRIPE_WEBHOOK_SECRET`
      : "STRIPE_WEBHOOK_SECRET",
  };
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function clubBankDetails(): SectionBankDetails | null {
  const holder = (process.env.BANK_ACCOUNT_HOLDER ?? "").trim();
  const iban = (process.env.BANK_IBAN ?? "").replace(/\s/g, "");
  if (iban.length < 15 || holder.length === 0) return null;
  return { holder, iban, formattedIban: formatIban(iban), source: "global-env" };
}

export function sectionBankDetailsFromEnvKey(
  paymentEnvKey: string | null | undefined,
): SectionBankDetails | null {
  if (!paymentEnvKey || !isValidPaymentEnvKey(paymentEnvKey)) return null;
  const names = paymentEnvVarNames(paymentEnvKey);
  const holder = readEnv(names.bankAccountHolder);
  const iban = readEnv(names.bankIban).replace(/\s/g, "").toUpperCase();
  if (iban.length < 15 || holder.length === 0) return null;
  return { holder, iban, formattedIban: formatIban(iban), source: "section-env" };
}

async function paymentEnvKeyForSection(sectionId: string | null | undefined) {
  if (!sectionId) return null;
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { paymentEnvKey: true },
  });
  return section?.paymentEnvKey ?? null;
}

export function stripeWebhookEndpointUrl() {
  return `${getPublicAppUrl()}/api/stripe/webhook`;
}

/**
 * Bankdaten kommen ausschließlich aus Render-Environment-Variablen.
 */
export async function resolveSectionBank(
  sectionId: string | null | undefined,
): Promise<SectionBankDetails | null> {
  if (sectionId) {
    return sectionBankDetailsFromEnvKey(await paymentEnvKeyForSection(sectionId));
  }
  return clubBankDetails();
}

export async function isSectionBankConfigured(
  sectionId: string | null | undefined,
) {
  return Boolean(await resolveSectionBank(sectionId));
}

/**
 * Stripe-Secrets kommen ausschließlich aus Render-Environment-Variablen.
 */
export async function resolveSectionStripeSecretKey(
  sectionId: string | null | undefined,
): Promise<string | null> {
  if (sectionId) {
    const envKey = await paymentEnvKeyForSection(sectionId);
    if (!envKey) return null;
    const key = cleanStripeEnv(readEnv(paymentEnvVarNames(envKey).stripeSecretKey));
    if (!key || isPlaceholderStripeKey(key)) return null;
    return key;
  }
  return getGlobalStripeSecretKey();
}

export async function resolveSectionStripeWebhookSecret(
  sectionId: string | null | undefined,
): Promise<string | null> {
  if (sectionId) {
    const envKey = await paymentEnvKeyForSection(sectionId);
    if (!envKey) return null;
    return cleanStripeEnv(readEnv(paymentEnvVarNames(envKey).stripeWebhookSecret)) || null;
  }
  return getGlobalStripeWebhookSecret();
}

export function sectionStripeStatusFromEnvKey(
  paymentEnvKey: string | null | undefined,
): SectionStripeStatus {
  if (!paymentEnvKey || !isValidPaymentEnvKey(paymentEnvKey)) {
    return {
      secretConfigured: false,
      webhookConfigured: false,
      checkoutReady: false,
      fullyReady: false,
      usingClubFallback: false,
    };
  }
  const names = paymentEnvVarNames(paymentEnvKey);
  const secret = cleanStripeEnv(readEnv(names.stripeSecretKey));
  const webhook = cleanStripeEnv(readEnv(names.stripeWebhookSecret));
  const secretConfigured = Boolean(secret && !isPlaceholderStripeKey(secret));
  const webhookConfigured = Boolean(webhook);
  const fullyReady = secretConfigured && webhookConfigured;
  return {
    secretConfigured,
    webhookConfigured,
    checkoutReady: secretConfigured,
    fullyReady,
    usingClubFallback: false,
  };
}

function globalStripeStatus(): SectionStripeStatus {
  const secret = Boolean(getGlobalStripeSecretKey());
  const webhook = Boolean(getGlobalStripeWebhookSecret());
  return {
    secretConfigured: secret,
    webhookConfigured: webhook,
    checkoutReady: secret,
    fullyReady: secret && webhook,
    usingClubFallback: secret,
  };
}

export async function getSectionStripeStatus(
  sectionId: string | null | undefined,
): Promise<SectionStripeStatus> {
  if (!sectionId) {
    return globalStripeStatus();
  }
  return sectionStripeStatusFromEnvKey(await paymentEnvKeyForSection(sectionId));
}

export async function isSectionStripeConfigured(
  sectionId: string | null | undefined,
) {
  if (isStripeDemoMode()) return true;
  if (
    cleanStripeEnv(process.env.SHOWCASE_MODE) === "1" &&
    getGlobalStripeSecretKey()
  ) {
    return true;
  }
  const status = await getSectionStripeStatus(sectionId);
  return status.checkoutReady;
}

/** Alle hinterlegten Secret Keys aus dem Render Environment, ohne Duplikate. */
export async function listAllStripeSecretKeys(): Promise<string[]> {
  const sections = await prisma.section.findMany({
    where: { paymentEnvKey: { not: null } },
    select: { paymentEnvKey: true },
  });
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const key = cleanStripeEnv(raw);
    if (isPlaceholderStripeKey(key)) return;
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  for (const section of sections) {
    if (!section.paymentEnvKey) continue;
    push(readEnv(paymentEnvVarNames(section.paymentEnvKey).stripeSecretKey));
  }
  push(getGlobalStripeSecretKey());
  return keys;
}

/** Alle Webhook-Secrets zum Verifizieren eingehender Events. */
export async function listAllStripeWebhookSecrets(): Promise<string[]> {
  const sections = await prisma.section.findMany({
    where: { paymentEnvKey: { not: null } },
    select: { paymentEnvKey: true },
  });
  const secrets: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const secret = cleanStripeEnv(raw);
    if (!secret || seen.has(secret)) return;
    seen.add(secret);
    secrets.push(secret);
  };
  for (const section of sections) {
    if (!section.paymentEnvKey) continue;
    push(readEnv(paymentEnvVarNames(section.paymentEnvKey).stripeWebhookSecret));
  }
  push(getGlobalStripeWebhookSecret());
  return secrets;
}
