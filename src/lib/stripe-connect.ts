import { headers } from "next/headers";
import type Stripe from "stripe";
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
};

const emptyConnect: ConnectAccountState = {
  accountId: "",
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
};

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

function stateFromSettings(settings: {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
} | null): ConnectAccountState {
  if (!settings?.stripeAccountId) return emptyConnect;
  return {
    accountId: settings.stripeAccountId,
    chargesEnabled: settings.stripeChargesEnabled,
    payoutsEnabled: settings.stripePayoutsEnabled,
    detailsSubmitted: settings.stripeDetailsSubmitted,
  };
}

async function clubIdForSection(sectionId: string | null | undefined) {
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { clubId: true },
    });
    if (section?.clubId) return section.clubId;
  }
  return currentClubId();
}

export async function connectAccountForClub(clubId: string) {
  const settings = await prisma.clubSettings.findUnique({
    where: { clubId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
    },
  });
  return stateFromSettings(settings);
}

export async function connectAccountForSection(
  sectionId: string | null | undefined,
) {
  const clubId = await clubIdForSection(sectionId);
  if (!clubId) return emptyConnect;
  return connectAccountForClub(clubId);
}

export async function currentClubHasConnectAccount() {
  const clubId = await currentClubId();
  if (!clubId) return false;
  const state = await connectAccountForClub(clubId);
  return Boolean(state.accountId);
}

export async function anyConnectAccount() {
  const clubId = await currentClubId();
  if (clubId) return currentClubHasConnectAccount();
  const row = await prisma.clubSettings.findFirst({
    where: { stripeAccountId: { not: null } },
    select: { clubId: true },
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

/** Clients für Nachschlagen: Connect-Konto des Vereins, danach Legacy-Schlüssel. */
export async function stripeClientsForLookup(): Promise<Stripe[]> {
  const clients: Stripe[] = [];
  const seenAccounts = new Set<string>();
  const pushAccount = (accountId: string | null | undefined) => {
    const id = accountId?.trim() ?? "";
    if (!id || seenAccounts.has(id) || !platformStripeSecret()) return;
    seenAccounts.add(id);
    clients.push(getConnectClient(id));
  };

  const clubId = await currentClubId();
  if (clubId) {
    pushAccount((await connectAccountForClub(clubId)).accountId);
  } else {
    const rows = await prisma.clubSettings.findMany({
      where: { stripeAccountId: { not: null } },
      select: { stripeAccountId: true },
    });
    for (const row of rows) pushAccount(row.stripeAccountId);
  }

  const { listAllStripeSecretKeys } = await import("@/lib/section-payments");
  for (const key of await listAllStripeSecretKeys()) {
    clients.push(getStripeWithKey(key));
  }
  return clients;
}

export async function saveConnectAccount(account: Stripe.Account) {
  const fromMeta = account.metadata?.clubId?.trim() ?? "";
  const existing = await prisma.clubSettings.findFirst({
    where: { stripeAccountId: account.id },
    select: { clubId: true },
  });
  const clubId = existing?.clubId || fromMeta;
  if (!clubId) return null;
  const settings = await prisma.clubSettings.findUnique({
    where: { clubId },
    select: { clubId: true },
  });
  if (!settings) return null;
  return prisma.clubSettings.update({
    where: { clubId },
    data: {
      stripeAccountId: account.id,
      stripeChargesEnabled: Boolean(account.charges_enabled),
      stripePayoutsEnabled: Boolean(account.payouts_enabled),
      stripeDetailsSubmitted: Boolean(account.details_submitted),
    },
  });
}

export async function refreshClubConnectStatus(clubId: string) {
  const state = await connectAccountForClub(clubId);
  if (!state.accountId || !platformStripeSecret()) return state;
  const account = await getPlatformStripe().accounts.retrieve(state.accountId);
  await saveConnectAccount(account);
  return connectAccountForClub(clubId);
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

async function accountLink(accountId: string, clubId: string) {
  const base = await operatorOrigin();
  return getPlatformStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${base}/vereine/${clubId}/stripe/erneuern`,
    return_url: `${base}/vereine/${clubId}/stripe/zurueck`,
    type: "account_onboarding",
  });
}

export async function beginClubStripeOnboarding(clubId: string): Promise<
  | { url: string }
  | { code: "no-platform-key" | "missing" | "stripe"; detail?: string }
> {
  if (!platformStripeSecret()) return { code: "no-platform-key" };
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: { settings: true },
  });
  if (!club?.settings) return { code: "missing" };

  const stripe = getPlatformStripe();
  try {
    let accountId = club.settings.stripeAccountId;
    if (!accountId) {
      const admin = await runWithClub(club.id, () =>
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
            losses: { payments: "application" },
            requirement_collection: "stripe",
          },
          business_profile: { name: club.name },
          metadata: { clubId: club.id },
        },
        { idempotencyKey: `connect-express-${club.id}` },
      );
      accountId = account.id;
      await saveConnectAccount(account);
    }

    if (club.settings.stripeChargesEnabled && club.settings.stripeDetailsSubmitted) {
      try {
        const login = await stripe.accounts.createLoginLink(accountId);
        return { url: login.url };
      } catch (error) {
        console.error("Stripe Express Login", clubId, error);
      }
    }
    const link = await accountLink(accountId, club.id);
    return { url: link.url };
  } catch (error) {
    console.error("Stripe Connect Onboarding", clubId, error);
    return { code: "stripe", detail: safeStripeDetail(error) };
  }
}

export async function clubStripeDashboardLink(clubId: string): Promise<
  | { url: string }
  | { code: "no-platform-key" | "missing" | "stripe"; detail?: string }
> {
  if (!platformStripeSecret()) return { code: "no-platform-key" };
  const state = await connectAccountForClub(clubId);
  if (!state.accountId) return { code: "missing" };
  try {
    const login = await getPlatformStripe().accounts.createLoginLink(state.accountId);
    return { url: login.url };
  } catch (error) {
    console.error("Stripe Express Dashboard", clubId, error);
    return beginClubStripeOnboarding(clubId);
  }
}
