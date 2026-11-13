import type { RegistrationPaymentInput } from "@/lib/registration-payment";

export type AccountLedgerKind =
  | "course"
  | "membership"
  | "addon"
  | "court"
  | "device"
  | "credit";

export type AccountLedgerItem = {
  id: string;
  at: Date;
  kind: AccountLedgerKind;
  title: string;
  renewal?: boolean;
  memberName: string | null;
  signedCents: number;
  payment: RegistrationPaymentInput | null;
};
