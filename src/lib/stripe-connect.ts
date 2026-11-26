import { headers } from "next/headers";
import type Stripe from "stripe";
import { decryptSecret } from "@/lib/club-secrets";
import { prisma } from "@/lib/prisma";
import { cardRail, type CardRail } from "@/lib/stripe-connect-mode";
import {
  cleanStripeEnv,
  getStripeWithKey,
  isPlaceholderStripeKey,
  isValidStripeSecretKey,
} from "@/lib/stripe";
import { currentClubId, platformBaseUrl, runWithClub } from "@/lib/tenant";

export type ConnectAccountState = {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  payoutLast4: string;
};

const emptyConnect: ConnectAccountState = {
  accountId: "",
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  payoutLast4: "",
};

const connectSelect = {
  stripeAccountId: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripePayoutLast4: true,
} as const;

export function platformStripeSecret() {
  const key = cleanStripeEnv(process.env.STRIPE_CONNECT_SECRET_KEY);
  if (!key || isPlaceholderStripeKey(key) || !isValidStripeSecretKey(key)) {
    return null;
  }
  return key;
}

export function platformWebhookSecret() {
  const secret = cleanStripeEnv(process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  if (secret.length < 10 || /placeholder|changeme/i.test(secret)) return null;
  return secret;
}

export function getPlatformStripe() {
  const key = platformStripeSecret();
  if (!key) throw new Error("STRIPE_CONNECT_SECRET_KEY fehlt.");
  return getStripeWithKey(key);
}

export function getConnectClient(accountId: string) {
  const key = platformStripeSecret();
  if (!key) throw new Error("STRIPE_CONNECT_SECRET_KEY fehlt.");
  return getStripeWithKey(key, accountId);
}

function stateFromConfig(config: {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripePayoutLast4: string;
} | null): ConnectAccountState {
  if (!config?.stripeAccountId) return emptyConnect;
  return {
    accountId: config.stripeAccountId,
    chargesEnabled: config.stripeChargesEnabled,
    payoutsEnabled: config.stripePayoutsEnabled,
    detailsSubmitted: config.stripeDetailsSubmitted,
    payoutLast4: config.stripePayoutLast4,
  };
}

export async function connectAccountForSection(
  sectionId: string | null | undefined,
) {
  if (!sectionId) return emptyConnect;
  const config = await prisma.sectionPaymentConfig.findUnique({
    where: { sectionId },
    select: connectSelect,
  });
  return stateFromConfig(config);
}

async function sectionIdsForLookup() {
  const clubId = await currentClubId();
  const sections = await prisma.section.findMany({
    where: clubId ? { clubId } : undefined,
    select: { id: true },
  });
  return sections.map((section) => section.id);
}

export async function currentClubHasConnectAccount() {
  const clubId = await currentClubId();
  if (!clubId) return false;
  const ids = await sectionIdsForLookup();
  if (ids.length === 0) return false;
  const row = await prisma.sectionPaymentConfig.findFirst({
    where: { sectionId: { in: ids }, stripeAccountId: { not: null } },
    select: { sectionId: true },
  });
  return Boolean(row);
}

export async function anyConnectAccount() {
  const clubId = await currentClubId();
  if (clubId) return currentClubHasConnectAccount();
  const row = await prisma.sectionPaymentConfig.findFirst({
    where: { stripeAccountId: { not: null } },
    select: { sectionId: true },
  });
  return Boolean(row);
}

export async function sectionCardRail(
  sectionId: string | null | undefined,
): Promise<CardRail> {
  const account = await connectAccountForSection(sectionId);
  if (account.accountId) {
    return cardRail({
      accountId: account.accountId,
      chargesEnabled: account.chargesEnabled,
      legacyReady: false,
    });
  }
  const { resolveSectionStripeSecretKey } = await import("@/lib/section-payments");
  const key = await resolveSectionStripeSecretKey(sectionId);
  return cardRail({
    accountId: "",
    chargesEnabled: false,
    legacyReady: Boolean(key && isValidStripeSecretKey(key)),
  });
}

/** Clients für Nachschlagen: Connect-Konten der Sektionen, danach Legacy-Schlüssel. */
export async function stripeClientsForLookup(): Promise<Stripe[]> {
  const clients: Stripe[] = [];
  const seenAccounts = new Set<string>();
  const ids = await sectionIdsForLookup();
  if (platformStripeSecret() && ids.length > 0) {
    const rows = await prisma.sectionPaymentConfig.findMany({
      where: { sectionId: { in: ids }, stripeAccountId: { not: null } },
      select: { stripeAccountId: true },
    });
    for (const row of rows) {
      const id = row.stripeAccountId?.trim() ?? "";
      if (!id || seenAccounts.has(id)) continue;
      seenAccounts.add(id);
      clients.push(getConnectClient(id));
    }
  }

  const { listAllStripeSecretKeys } = await import("@/lib/section-payments");
  for (const key of await listAllStripeSecretKeys()) {
    clients.push(getStripeWithKey(key));
  }
  return clients;
}

async function sectionIdForAccount(account: Stripe.Account) {
  const fromMeta = account.metadata?.sectionId?.trim() ?? "";
  const existing = await prisma.sectionPaymentConfig.findFirst({
    where: { stripeAccountId: account.id },
    select: { sectionId: true },
  });
  return existing?.sectionId || fromMeta;
}

export async function saveConnectAccount(account: Stripe.Account) {
  const sectionId = await sectionIdForAccount(account);
  if (!sectionId) return null;
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true },
  });
  if (!section) return null;
  return prisma.sectionPaymentConfig.upsert({
    where: { sectionId },
    create: {
      sectionId,
      stripeAccountId: account.id,
      stripeChargesEnabled: Boolean(account.charges_enabled),
      stripePayoutsEnabled: Boolean(account.payouts_enabled),
      stripeDetailsSubmitted: Boolean(account.details_submitted),
    },
    update: {
      stripeAccountId: account.id,
      stripeChargesEnabled: Boolean(account.charges_enabled),
      stripePayoutsEnabled: Boolean(account.payouts_enabled),
      stripeDetailsSubmitted: Boolean(account.details_submitted),
    },
  });
}

function sectionBank(config: {
  bankAccountHolder: string;
  bankIban: string;
} | null) {
  const holder = config?.bankAccountHolder.trim() ?? "";
  const iban = decryptSecret(config?.bankIban ?? "").replace(/\s/g, "").toUpperCase();
  if (iban.length < 15 || !holder) return null;
  return { holder, iban, last4: iban.slice(-4) };
}

/** Hängt die IBAN der Sektion als Auszahlungskonto an ihr Stripe-Konto. */
export async function syncSectionPayoutBank(sectionId: string) {
  const config = await prisma.sectionPaymentConfig.findUnique({
    where: { sectionId },
  });
  const accountId = config?.stripeAccountId ?? "";
  const bank = sectionBank(config);
  if (!accountId || !bank || !platformStripeSecret()) return "";
  const stripe = getPlatformStripe();
  try {
    const existing = await stripe.accounts.listExternalAccounts(accountId, {
      object: "bank_account",
      limit: 10,
    });
    const found = existing.data.find(
      (item) => "last4" in item && item.last4 === bank.last4,
    );
    if (found && "id" in found) {
      if ("default_for_currency" in found && !found.default_for_currency) {
        await stripe.accounts.updateExternalAccount(accountId, found.id, {
          default_for_currency: true,
        });
      }
      await prisma.sectionPaymentConfig.update({
        where: { sectionId },
        data: { stripePayoutLast4: bank.last4 },
      });
      return bank.last4;
    }
    try {
      await stripe.accounts.createExternalAccount(accountId, {
        external_account: {
          object: "bank_account",
          country: bank.iban.slice(0, 2),
          currency: "eur",
          account_number: bank.iban,
          account_holder_name: bank.holder,
          account_holder_type: "company",
        },
        default_for_currency: true,
      });
      await prisma.sectionPaymentConfig.update({
        where: { sectionId },
        data: { stripePayoutLast4: bank.last4 },
      });
      return bank.last4;
    } catch (error) {
      const current = existing.data.find(
        (item) => "last4" in item && "default_for_currency" in item && item.default_for_currency,
      ) ?? existing.data.find((item) => "last4" in item);
      const last4 = current && "last4" in current ? current.last4 ?? "" : "";
      if (last4) {
        await prisma.sectionPaymentConfig.update({
          where: { sectionId },
          data: { stripePayoutLast4: last4 },
        });
      }
      console.error("Stripe Auszahlungskonto", sectionId, error);
      return last4;
    }
  } catch (error) {
    console.error("Stripe Auszahlungskonto", sectionId, error);
    return config?.stripePayoutLast4 ?? "";
  }
}

export async function refreshSectionConnectStatus(sectionId: string) {
  const state = await connectAccountForSection(sectionId);
  if (!state.accountId || !platformStripeSecret()) return state;
  const account = await getPlatformStripe().accounts.retrieve(state.accountId);
  await saveConnectAccount(account);
  await syncSectionPayoutBank(sectionId);
  return connectAccountForSection(sectionId);
}

/** Origin des Betreibers. Lokal bleibt der Port erhalten (127.0.0.1:4521). */
async function operatorOrigin() {
  try {
    const headerList = await headers();
    const rawHost = (headerList.get("host") || "").split(",")[0]?.trim() ?? "";
    const name = rawHost.replace(/:\d+$/, "").toLowerCase();
    const local =
      name === "localhost" || name === "127.0.0.1" || name.endsWith(".localhost");
    if (rawHost && local) return `http://${rawHost.toLowerCase()}`;
  } catch {
    // außerhalb einer Anfrage
  }
  return (await platformBaseUrl()).replace(/\/+$/, "");
}

export async function connectWebhookUrl() {
  return `${await operatorOrigin()}/api/stripe/webhook`;
}

function safeStripeDetail(error: unknown) {
  const err = error as { message?: string; raw?: { message?: string } };
  return (err.raw?.message || err.message || "Stripe hat die Anfrage abgelehnt.")
    .replace(/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/g, "Stripe-Schlüssel")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function accountLink(accountId: string, clubId: string, sectionId: string) {
  const base = await operatorOrigin();
  return getPlatformStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${base}/vereine/${clubId}/stripe/${sectionId}/erneuern`,
    return_url: `${base}/vereine/${clubId}/stripe/${sectionId}/zurueck`,
    type: "account_onboarding",
  });
}

export async function beginSectionStripeOnboarding(sectionId: string): Promise<
  | { url: string }
  | { code: "no-platform-key" | "missing" | "missing-iban" | "stripe"; detail?: string }
> {
  if (!platformStripeSecret()) return { code: "no-platform-key" };
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { club: true, paymentConfig: true },
  });
  if (!section) return { code: "missing" };
  if (!sectionBank(section.paymentConfig)) return { code: "missing-iban" };

  const stripe = getPlatformStripe();
  try {
    let accountId = section.paymentConfig?.stripeAccountId ?? null;
    if (!accountId) {
      const admin = await runWithClub(section.clubId, () =>
        prisma.user.findFirst({
          where: { role: "ADMIN", canLogin: true },
          orderBy: { createdAt: "asc" },
          select: { email: true },
        }),
      );
      const email = admin?.email?.trim().toLowerCase() ?? "";
      const account = await stripe.accounts.create(
        {
          country: "IT",
          ...(email.includes("@") && !email.endsWith(".local") ? { email } : {}),
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          controller: {
            stripe_dashboard: { type: "express" },
            fees: { payer: "account" },
            losses: { payments: "stripe" },
            requirement_collection: "stripe",
          },
          business_profile: { name: `${section.club.name} – ${section.name}` },
          metadata: {
            clubId: section.clubId,
            sectionId: section.id,
            sectionName: section.name,
          },
        },
        { idempotencyKey: `connect-express-section-v2-${section.id}` },
      );
      accountId = account.id;
      await saveConnectAccount(account);
    }

    await syncSectionPayoutBank(section.id);

    const ready =
      Boolean(section.paymentConfig?.stripeChargesEnabled) &&
      Boolean(section.paymentConfig?.stripeDetailsSubmitted);
    if (ready) {
      try {
        const login = await stripe.accounts.createLoginLink(accountId);
        return { url: login.url };
      } catch (error) {
        console.error("Stripe Express Login", sectionId, error);
      }
    }
    const link = await accountLink(accountId, section.clubId, section.id);
    return { url: link.url };
  } catch (error) {
    console.error("Stripe Connect Onboarding", sectionId, error);
    return { code: "stripe", detail: safeStripeDetail(error) };
  }
}

export async function sectionStripeDashboardLink(sectionId: string): Promise<
  | { url: string }
  | { code: "no-platform-key" | "missing" | "missing-iban" | "stripe"; detail?: string }
> {
  if (!platformStripeSecret()) return { code: "no-platform-key" };
  const state = await connectAccountForSection(sectionId);
  if (!state.accountId) return { code: "missing" };
  try {
    const login = await getPlatformStripe().accounts.createLoginLink(state.accountId);
    return { url: login.url };
  } catch (error) {
    console.error("Stripe Express Dashboard", sectionId, error);
    return beginSectionStripeOnboarding(sectionId);
  }
}
