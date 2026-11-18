import { formatIban } from "@/lib/bank-transfer";
import { decryptSecret } from "@/lib/club-secrets";
import { usesLegacyEnv, getCurrentClubRecord } from "@/lib/club-settings";
import { prisma } from "@/lib/prisma";
import {
  cleanStripeEnv,
  isPlaceholderStripeKey,
  getGlobalStripeSecretKey,
  getGlobalStripeWebhookSecret,
  getAppUrl,
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

async function legacyPaymentEnv() {
  const club = await getCurrentClubRecord();
  if (!club) return true;
  return usesLegacyEnv(club);
}

async function storedSectionPayment(sectionId: string) {
  const row = await prisma.sectionPaymentConfig.findUnique({
    where: { sectionId },
  });
  if (!row) return null;
  const holder = row.bankAccountHolder.trim();
  const iban = decryptSecret(row.bankIban).replace(/\s/g, "").toUpperCase();
  const secret = cleanStripeEnv(decryptSecret(row.stripeSecretKey));
  const webhook = cleanStripeEnv(decryptSecret(row.stripeWebhookSecret));
  if (!holder && !iban && !secret && !webhook) return null;
  return { holder, iban, secret, webhook };
}

export async function stripeWebhookEndpointUrl() {
  return `${await getAppUrl()}/api/stripe/webhook`;
}

/**
 * Bankdaten kommen ausschließlich aus Render-Environment-Variablen.
 */
export async function resolveSectionBank(
  sectionId: string | null | undefined,
): Promise<SectionBankDetails | null> {
  if (sectionId) {
    const stored = await storedSectionPayment(sectionId);
    if (stored && stored.iban.length >= 15 && stored.holder) {
      return {
        holder: stored.holder,
        iban: stored.iban,
        formattedIban: formatIban(stored.iban),
        source: "section-env",
      };
    }
    if (!(await legacyPaymentEnv())) return null;
    return sectionBankDetailsFromEnvKey(await paymentEnvKeyForSection(sectionId));
  }
  if (!(await legacyPaymentEnv())) return null;
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
    const stored = await storedSectionPayment(sectionId);
    if (stored?.secret && !isPlaceholderStripeKey(stored.secret)) return stored.secret;
    if (!(await legacyPaymentEnv())) return null;
    const envKey = await paymentEnvKeyForSection(sectionId);
    if (!envKey) return null;
    const key = cleanStripeEnv(readEnv(paymentEnvVarNames(envKey).stripeSecretKey));
    if (!key || isPlaceholderStripeKey(key)) return null;
    return key;
  }
  if (!(await legacyPaymentEnv())) return null;
  return getGlobalStripeSecretKey();
}

export async function resolveSectionStripeWebhookSecret(
  sectionId: string | null | undefined,
): Promise<string | null> {
  if (sectionId) {
    const stored = await storedSectionPayment(sectionId);
    if (stored?.webhook) return stored.webhook;
    if (!(await legacyPaymentEnv())) return null;
    const envKey = await paymentEnvKeyForSection(sectionId);
    if (!envKey) return null;
    return cleanStripeEnv(readEnv(paymentEnvVarNames(envKey).stripeWebhookSecret)) || null;
  }
  if (!(await legacyPaymentEnv())) return null;
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
    if (!(await legacyPaymentEnv())) {
      return {
        secretConfigured: false,
        webhookConfigured: false,
        checkoutReady: false,
        fullyReady: false,
        usingClubFallback: false,
      };
    }
    return globalStripeStatus();
  }
  const stored = await storedSectionPayment(sectionId);
  if (stored && (stored.secret || stored.webhook)) {
    const secretConfigured = Boolean(stored.secret && !isPlaceholderStripeKey(stored.secret));
    const webhookConfigured = Boolean(stored.webhook);
    return {
      secretConfigured,
      webhookConfigured,
      checkoutReady: secretConfigured,
      fullyReady: secretConfigured && webhookConfigured,
      usingClubFallback: false,
    };
  }
  if (!(await legacyPaymentEnv())) {
    return {
      secretConfigured: false,
      webhookConfigured: false,
      checkoutReady: false,
      fullyReady: false,
      usingClubFallback: false,
    };
  }
  return sectionStripeStatusFromEnvKey(await paymentEnvKeyForSection(sectionId));
}

export async function isSectionStripeConfigured(
  sectionId: string | null | undefined,
) {
  if (await isStripeDemoMode()) return true;
  if (
    cleanStripeEnv(process.env.SHOWCASE_MODE) === "1" &&
    getGlobalStripeSecretKey()
  ) {
    return true;
  }
  const status = await getSectionStripeStatus(sectionId);
  return status.checkoutReady;
}

/** Secret Keys des aktuellen Vereins, sonst (ohne Verein) aller Vereine. */
export async function listAllStripeSecretKeys(): Promise<string[]> {
  const sections = await prisma.section.findMany({
    select: { id: true, paymentEnvKey: true },
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
  const legacy = await legacyPaymentEnv();
  for (const section of sections) {
    const stored = await storedSectionPayment(section.id);
    if (stored?.secret) {
      push(stored.secret);
      continue;
    }
    if (legacy && section.paymentEnvKey) {
      push(readEnv(paymentEnvVarNames(section.paymentEnvKey).stripeSecretKey));
    }
  }
  if (legacy) push(getGlobalStripeSecretKey());
  return keys;
}

/** Alle Webhook-Secrets zum Verifizieren eingehender Events. */
export async function listAllStripeWebhookSecrets(): Promise<string[]> {
  const sections = await prisma.section.findMany({
    select: { id: true, paymentEnvKey: true },
  });
  const secrets: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const secret = cleanStripeEnv(raw);
    if (!secret || seen.has(secret)) return;
    seen.add(secret);
    secrets.push(secret);
  };
  const legacy = await legacyPaymentEnv();
  for (const section of sections) {
    const stored = await storedSectionPayment(section.id);
    if (stored?.webhook) {
      push(stored.webhook);
      continue;
    }
    if (legacy && section.paymentEnvKey) {
      push(readEnv(paymentEnvVarNames(section.paymentEnvKey).stripeWebhookSecret));
    }
  }
  if (legacy) push(getGlobalStripeWebhookSecret());
  return secrets;
}
