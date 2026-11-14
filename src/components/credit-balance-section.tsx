"use client";

import type { AccountLedgerItem, AccountLedgerKind } from "@/lib/account-transaction-types";
import {
  creditTransactionKindLabel,
  creditTransactionSignedAmount,
} from "@/lib/credit-display";
import type { CreditAccountRow, CreditTransactionRow } from "@/lib/credit-types";
import { formatDateTime, formatEuro } from "@/lib/format";
import { registrationPaymentLabel } from "@/lib/registration-payment";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellTruncate,
} from "@/components/ui/table";
import { useI18n } from "@/components/locale-provider";
import type { TFunction } from "@/lib/i18n/types";

export function CreditAccountsSection({
  totalCreditCents,
  accounts,
}: {
  totalCreditCents: number;
  accounts: CreditAccountRow[];
}) {
  const { t } = useI18n();

  return (
    <section className="mt-6">
      <h2 className="text-lg font-medium">{t("accounting.creditAccountsTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("accounting.creditAccountsDesc")}
      </p>

      <div className="mt-3 inline-flex min-w-[12rem] flex-col rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
        <p className="text-xs font-medium text-emerald-900">
          {t("accounting.creditTotalAll")}
        </p>
        <p className="mt-0.5 font-heading text-2xl text-emerald-950">
          {formatEuro(totalCreditCents)}
        </p>
        <p className="mt-1 text-xs text-emerald-900">
          {accounts.length}{" "}
          {accounts.length === 1
            ? t("accounting.personsWithCreditOne")
            : t("accounting.personsWithCreditMany")}
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-card p-8 text-sm text-muted-foreground ring-1 ring-foreground/10">
          {t("accounting.creditAccountsEmpty")}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {accounts.map((account) => (
            <CreditAccountItem
              key={`${account.userId}:${account.sectionName ?? "verein"}`}
              account={account}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreditAccountItem({ account }: { account: CreditAccountRow }) {
  const { t } = useI18n();

  return (
    <details className="group rounded-2xl bg-card ring-1 ring-foreground/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="font-medium">
            {account.name}
            {account.sectionName ? ` · ${account.sectionName}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {account.sectionName
              ? `Sektionsguthaben · ${account.email}`
              : account.email}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-heading text-2xl text-emerald-800">
            {formatEuro(account.creditBalanceCents)}
          </span>
          <span className="text-sm text-muted-foreground group-open:rotate-180">
            ▼
          </span>
        </div>
      </summary>
      <div className="border-t border-border px-5 pb-5">
        <CreditTransactionTable
          transactions={account.transactions}
          empty={t("accounting.creditAccountNoTransactions")}
        />
      </div>
    </details>
  );
}

export function CreditBalanceSection({
  balanceCents,
  transactions,
  sectionBalances = [],
}: {
  balanceCents: number;
  transactions: AccountLedgerItem[];
  sectionBalances?: { sectionId: string; name: string; balanceCents: number }[];
}) {
  const { t } = useI18n();

  return (
    <section className="mt-8">
      <h2 className="text-2xl text-primary">{t("account.creditTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("account.creditDesc")}</p>

      <div
        className={`mt-4 rounded-xl border p-5 ${
          balanceCents > 0
            ? "border-emerald-200 bg-emerald-50"
            : "border-border bg-card"
        }`}
      >
        <p
          className={`text-sm font-medium ${
            balanceCents > 0 ? "text-emerald-900" : "text-muted-foreground"
          }`}
        >
          {t("account.creditCurrent")}
        </p>
        <p
          className={`mt-1 font-heading text-4xl ${
            balanceCents > 0 ? "text-emerald-950" : "text-foreground"
          }`}
        >
          {formatEuro(balanceCents)}
        </p>
        {balanceCents > 0 ? (
          <p className="mt-2 text-sm text-emerald-900">{t("account.creditUsageHint")}</p>
        ) : null}
      </div>

      {sectionBalances.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {sectionBalances.map((section) => (
            <li
              key={section.sectionId}
              className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-emerald-950">
                  Guthaben {section.name}
                </p>
                <p className="text-xs text-emerald-900">
                  Nur für Buchungen dieser Sektion.
                </p>
              </div>
              <p className="font-heading text-2xl text-emerald-950">
                {formatEuro(section.balanceCents)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <h2 className="mt-8 text-2xl text-primary">{t("account.transactionsTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("account.transactionsHint")}
      </p>
      <div className="mt-4">
        <AccountTransactionTable
          transactions={transactions}
          empty={t("account.transactionsEmpty")}
        />
      </div>
    </section>
  );
}

function ledgerKindLabel(kind: AccountLedgerKind, t: TFunction) {
  if (kind === "credit") return t("account.creditKindCredit");
  if (kind === "course") return t("accounting.kindCourse");
  if (kind === "membership") return t("accounting.kindMembership");
  if (kind === "court") return t("accounting.kindCourt");
  if (kind === "device") return t("accounting.kindDevice");
  return t("accounting.kindAddon");
}

function AccountTransactionTable({
  transactions,
  empty,
}: {
  transactions: AccountLedgerItem[];
  empty: string;
}) {
  const { t } = useI18n();

  if (transactions.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  const rows = transactions.map((item) => {
    const positive = item.signedCents > 0;
    const title = item.renewal
      ? `${item.title} (${t("account.txRenewal")})`
      : item.title;
    const paymentLabel = item.payment
      ? registrationPaymentLabel(item.payment, t)
      : t("account.creditKindCredit");
    return { item, positive, title, paymentLabel };
  });

  return (
    <>
      <ul className="mt-4 grid gap-3 sm:hidden">
        {rows.map(({ item, positive, title, paymentLabel }) => (
          <li
            key={item.id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(item.at)}
                </p>
                <p className="mt-1 font-medium leading-snug">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ledgerKindLabel(item.kind, t)}
                  {item.memberName ? ` · ${item.memberName}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {paymentLabel ?? "—"}
                </p>
              </div>
              <p
                className={`shrink-0 font-medium tabular-nums ${
                  positive ? "text-emerald-700" : "text-foreground"
                }`}
              >
                {positive ? "+" : "−"}
                {formatEuro(Math.abs(item.signedCents))}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">{t("common.date")}</TableHead>
              <TableHead className="whitespace-nowrap">
                {t("account.creditTableKind")}
              </TableHead>
              <TableHead className="whitespace-nowrap">{t("common.member")}</TableHead>
              <TableHead>{t("common.description")}</TableHead>
              <TableHead className="whitespace-nowrap">
                {t("account.tablePayment")}
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                {t("common.amount")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, positive, title, paymentLabel }) => (
              <TableRow key={item.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {formatDateTime(item.at)}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {ledgerKindLabel(item.kind, t)}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {item.memberName ?? "—"}
                </TableCell>
                <TableCell className="max-w-[16rem] text-xs" title={title}>
                  <span className="line-clamp-2">{title}</span>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {paymentLabel ?? "—"}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap text-right font-medium tabular-nums ${
                    positive ? "text-emerald-700" : "text-foreground"
                  }`}
                >
                  {positive ? "+" : "−"}
                  {formatEuro(Math.abs(item.signedCents))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function CreditTransactionTable({
  transactions,
  empty,
}: {
  transactions: CreditTransactionRow[];
  empty: string;
}) {
  const { t } = useI18n();

  if (transactions.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl ring-1 ring-foreground/10">
      <Table layout="fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[7.25rem]">{t("common.date")}</TableHead>
            <TableHead className="w-[5.5rem]">{t("account.creditTableKind")}</TableHead>
            <TableHead className={tableCellTruncate}>{t("common.description")}</TableHead>
            <TableHead className="w-[4.75rem] text-right">{t("common.amount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((item) => {
            const signed = creditTransactionSignedAmount(item.kind, item.amountCents);
            const positive = signed > 0;
            return (
              <TableRow key={item.id}>
                <TableCell className="text-xs whitespace-nowrap">{formatDateTime(item.createdAt)}</TableCell>
                <TableCell className="text-xs">{creditTransactionKindLabel(item.kind, t)}</TableCell>
                <TableCell className={tableCellTruncate} title={item.description}>
                  {item.description}
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    positive ? "text-emerald-700" : "text-foreground"
                  }`}
                >
                  {positive ? "+" : "−"}
                  {formatEuro(Math.abs(signed))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
