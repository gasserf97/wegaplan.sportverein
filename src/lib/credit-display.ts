import type { CreditTransactionKind } from "@/generated/prisma/client";
import type { TFunction } from "@/lib/i18n/types";

export function creditTransactionKindLabel(
  kind: CreditTransactionKind,
  t: TFunction,
) {
  switch (kind) {
    case "REFUND":
      return t("account.creditKindCredit");
    case "PAYMENT":
      return t("account.creditKindDebit");
    default:
      return kind;
  }
}

export function creditTransactionSignedAmount(
  kind: CreditTransactionKind,
  amountCents: number,
) {
  return kind === "REFUND" ? amountCents : -amountCents;
}
