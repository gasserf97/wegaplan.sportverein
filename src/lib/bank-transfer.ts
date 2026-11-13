import { randomBytes } from "node:crypto";
import {
  isSectionBankConfigured,
  resolveSectionBank,
  type SectionBankDetails,
} from "@/lib/section-payments";

export type CheckoutPaymentChoice = "stripe" | "bank_transfer";

/** @deprecated Prefer isSectionBankConfigured(sectionId) */
export function isBankTransferConfigured() {
  const iban = (process.env.BANK_IBAN ?? "").replace(/\s/g, "");
  const holder = (process.env.BANK_ACCOUNT_HOLDER ?? "").trim();
  return iban.length >= 15 && holder.length > 0;
}

/** @deprecated Prefer resolveSectionBank(sectionId) */
export function bankTransferDetails(): {
  holder: string;
  iban: string;
} | null {
  const holder = (process.env.BANK_ACCOUNT_HOLDER ?? "").trim();
  const iban = (process.env.BANK_IBAN ?? "").replace(/\s/g, "");
  if (!isBankTransferConfigured()) return null;
  return { holder, iban: formatIban(iban) };
}

export async function bankTransferDetailsForSection(
  sectionId: string | null | undefined,
): Promise<SectionBankDetails | null> {
  return resolveSectionBank(sectionId);
}

export async function isBankTransferConfiguredForSection(
  sectionId: string | null | undefined,
) {
  return isSectionBankConfigured(sectionId);
}

export function formatIban(raw: string) {
  return raw
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export function createPaymentReference() {
  const token = randomBytes(4).toString("hex").toUpperCase();
  return `ASC-${token}`;
}

export function createBankTransferGroupId() {
  return `bank-${randomBytes(6).toString("hex")}`;
}
