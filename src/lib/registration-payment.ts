import type { TFunction } from "@/lib/i18n/types";

export type RegistrationPaymentInput = {
  paymentMethod: string | null;
  creditAppliedCents: number;
  paidCents: number | null;
  listPriceCents: number;
  bankTransferApprovedAt: Date | null;
  stripeSessionId?: string | null;
  settled: boolean;
};

/** Same wording as Buchhaltung: Karte, Überweisung (bestätigt/offen), Guthaben. */
export function registrationPaymentLabel(
  item: RegistrationPaymentInput,
  t: TFunction,
): string | null {
  const credit = Math.max(0, item.creditAppliedCents);
  const booked = item.paidCents ?? (item.settled ? item.listPriceCents : 0);
  const external = Math.max(0, booked - credit);

  let channel: string | null = null;
  if (item.paymentMethod === "BANK_TRANSFER") {
    channel =
      item.settled || item.bankTransferApprovedAt
        ? t("admin.paymentTransferConfirmed")
        : t("admin.paymentTransferUnconfirmed");
  } else if (item.paymentMethod === "STRIPE" || item.stripeSessionId) {
    channel = t("accounting.channelCard");
  }

  if (credit > 0 && (external > 0 || Boolean(channel))) {
    return channel
      ? t("accounting.channelMixed", { channel })
      : t("accounting.channelCredit");
  }
  if (credit > 0) return t("accounting.channelCredit");
  if (channel) return channel;
  if (item.settled && item.listPriceCents === 0) {
    return t("accounting.channelFree");
  }
  return null;
}
