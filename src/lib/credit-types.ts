import type { CreditTransactionKind } from "@/generated/prisma/client";

export type CreditTransactionRow = {
  id: string;
  amountCents: number;
  kind: CreditTransactionKind;
  description: string;
  enrollmentId: string | null;
  createdAt: Date;
};

export type CreditAccountRow = {
  userId: string;
  name: string;
  email: string;
  username: string;
  creditBalanceCents: number;
  transactions: CreditTransactionRow[];
};

export type CreditAccountsReport = {
  totalCreditCents: number;
  accounts: CreditAccountRow[];
};
