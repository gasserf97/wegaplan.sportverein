import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { AccountingFilter } from "@/components/accounting-filter";
import { DeleteAccountingPaymentButton } from "@/components/delete-accounting-payment-button";

import { ApproveBankTransferButton } from "@/components/approve-bank-transfer-button";
import { ConfirmPendingRefundButton } from "@/components/confirm-pending-refund-button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellActions,
  tableCellTruncate,
  tableHeadActions,
} from "@/components/ui/table";

import { CreditAccountsSection } from "@/components/credit-balance-section";

import { requireCourseManager } from "@/lib/auth";

import {
  ALL_SECTIONS,
  loadAccountingReport,
  paymentKindLabel,
  paymentPersonLabel,
  paymentChannelLabel,
  paymentExternalCents,
  paymentStatusLabel,
  type AccountingBreakdown,
  type AccountingMonth,
  type AccountingPayment,
  type BankTransferRow,
  type PendingRefundAccountingRow,
} from "@/lib/accounting";

import { loadCreditAccountsReport } from "@/lib/credit";

import { formatDateTime, formatEuro, formatShortDate } from "@/lib/format";

import { getServerI18n } from "@/lib/i18n";

import type { TFunction } from "@/lib/i18n/types";
import { ChevronDownIcon } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();

  return { title: t("accounting.title") };
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ sektion?: string; zeitraum?: string }>;
}) {
  const { locale, t } = await getServerI18n();

  const manager = await requireCourseManager();

  if (!manager) redirect("/admin");

  const { sektion, zeitraum } = await searchParams;

  const report = await loadAccountingReport(manager.id, sektion, locale, zeitraum);

  const selectedSection =
    report.selectedKey === ALL_SECTIONS
      ? null
      : report.sections.find((section) => section.id === report.selectedKey);
  const showTennisCredit =
    (report.isGlobalAdmin && report.selectedKey === ALL_SECTIONS) ||
    selectedSection?.name === "Tennis" ||
    (report.selectedKey === ALL_SECTIONS &&
      report.sections.length === 1 &&
      report.sections[0]?.name === "Tennis");

  const creditReport = showTennisCredit
    ? await loadCreditAccountsReport()
    : null;

  const combinedLabel =
    report.sections.length === 1
      ? report.sections[0].name
      : t("accounting.filterCombined");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl text-primary">{t("accounting.title")}</h1>

          <p className="mt-2 max-w-2xl text-muted-foreground">
            {t("accounting.intro")}{" "}
            {report.isGlobalAdmin
              ? t("accounting.scopeGlobal")
              : t("accounting.scopeSection")}
          </p>
        </div>

        {report.sections.length > 0 ? (
          <AccountingFilter
            sections={report.sections}

            selectedKey={
              report.allowCombined || report.selectedKey !== ALL_SECTIONS
                ? report.selectedKey
                : (report.sections[0]?.id ?? ALL_SECTIONS)
            }

            selectedPeriod={report.periodKey}

            allowClubWide={report.allowClubWide}

            allowCombined={report.allowCombined}

            combinedLabel={combinedLabel}
          />
        ) : null}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {t("accounting.filterView")}{" "}
        <strong className="text-foreground">{report.selectedLabel}</strong>
        {" · "}
        <strong className="text-foreground">
          {t(
            `accounting.period.${report.periodKey === "alle" ? "all" : report.periodKey}`,
          )}
        </strong>
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label={t("accounting.statsIncoming")}
          value={formatEuro(report.paidCents, locale)}
          hint={t("accounting.statsIncomingHint")}
        />

        <Stat
          label={t("accounting.statsStripe")}
          value={formatEuro(report.incomingByMethod.stripeNetCents, locale)}
          hint={
            report.incomingByMethod.stripeFeeCents > 0
              ? report.incomingByMethod.stripeFeeEstimatedCount > 0
                ? t("accounting.statsStripeFeeHintEstimated", {
                    gross: formatEuro(
                      report.incomingByMethod.stripeCents,
                      locale,
                    ),
                    fees: formatEuro(
                      report.incomingByMethod.stripeFeeCents,
                      locale,
                    ),
                  })
                : t("accounting.statsStripeFeeHint", {
                    gross: formatEuro(
                      report.incomingByMethod.stripeCents,
                      locale,
                    ),
                    fees: formatEuro(
                      report.incomingByMethod.stripeFeeCents,
                      locale,
                    ),
                  })
              : report.incomingByMethod.stripeCount === 1
                ? t("accounting.statsStripeHintOne")
                : t("accounting.statsStripeHintMany", {
                    n: report.incomingByMethod.stripeCount,
                  })
          }
        />

        <Stat
          label={t("accounting.statsBank")}
          value={formatEuro(report.incomingByMethod.bankTransferCents, locale)}
          hint={
            report.incomingByMethod.bankTransferCount === 1
              ? t("accounting.statsBankHintOne")
              : t("accounting.statsBankHintMany", {
                  n: report.incomingByMethod.bankTransferCount,
                })
          }
        />

        <Stat
          label={t("accounting.statsOpen")}
          value={formatEuro(report.pendingCents, locale)}
          hint={
            report.pendingCount === 0
              ? undefined
              : report.pendingCount === 1
                ? t("accounting.statsOpenHintOne")
                : t("accounting.statsOpenHintMany", { n: report.pendingCount })
          }
        />

        <Stat
          label={t("accounting.statsPendingRefund")}
          value={formatEuro(report.pendingRefundCents, locale)}
          hint={
            report.pendingRefundCount === 0
              ? undefined
              : report.pendingRefundCount === 1
                ? t("accounting.statsPendingRefundHintOne")
                : t("accounting.statsPendingRefundHintMany", {
                    n: report.pendingRefundCount,
                  })
          }
        />
      </div>

      {report.incomingByMethod.stripeFeeCents > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("accounting.statsNetIncoming", {
            amount: formatEuro(
              report.incomingByMethod.stripeNetCents +
                report.incomingByMethod.bankTransferCents,
              locale,
            ),
          })}
        </p>
      ) : null}

      {creditReport ? (
        <CreditAccountsSection
          totalCreditCents={creditReport.totalCreditCents}
          accounts={creditReport.accounts}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-medium">{t("accounting.membersTitle")}</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {t("accounting.membersDesc")}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Stat
            label={t("accounting.membersPaid")}

            value={String(report.memberCounts.membershipCount)}

            hint={
              report.memberCounts.membershipCount === 1
                ? t("accounting.memberOne")
                : t("accounting.memberMany", {
                    n: report.memberCounts.membershipCount,
                  })
            }
          />

          <Stat
            label={t("accounting.membersTennis")}

            value={String(report.memberCounts.tennisCount)}

            hint={
              report.memberCounts.tennisCount === 1
                ? t("accounting.memberOne")
                : t("accounting.memberMany", {
                    n: report.memberCounts.tennisCount,
                  })
            }
          />
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title={t("accounting.bySection")}
          rows={report.bySection}
          t={t}
        />

        <BreakdownCard
          title={t("accounting.byKind")}
          rows={report.byKind}
          t={t}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("accounting.breakdownHint")}
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-medium">
          {t("accounting.withoutMembershipTitle")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("accounting.withoutMembershipDesc")}
        </p>
        <div className="mt-4 max-w-sm">
          <Stat
            label={t("accounting.withoutMembershipTitle")}
            value={formatEuro(report.withoutMembershipCents, locale)}
            hint={
              report.withoutMembershipCount === 1
                ? t("accounting.withoutMembershipHintOne")
                : t("accounting.withoutMembershipHintMany", {
                    n: report.withoutMembershipCount,
                  })
            }
          />
        </div>
        <CompactPaymentList
          title={t("accounting.withoutMembershipTitle")}
          empty={t("accounting.withoutMembershipEmpty")}
          rows={report.withoutMembership}
          countLabel={
            report.withoutMembershipCount === 1
              ? t("accounting.withoutMembershipHintOne")
              : t("accounting.withoutMembershipHintMany", {
                  n: report.withoutMembershipCount,
                })
          }
          className="mt-4"
          t={t}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-2xl">{t("accounting.monthsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("accounting.monthsDesc")}
        </p>
        <MonthBars months={report.months} t={t} />
      </section>

      <PaymentTable
        title={t("accounting.openTitle")}
        description={t("accounting.openDesc")}
        empty={t("accounting.openEmpty")}
        rows={report.open}
        showSection={report.selectedKey === ALL_SECTIONS}
        pending
        t={t}
      />

      <PendingRefundTable
        title={t("accounting.pendingRefundTitle")}
        description={t("accounting.pendingRefundDesc")}
        empty={t("accounting.pendingRefundEmpty")}
        rows={report.pendingRefunds}
        showSection={report.selectedKey === ALL_SECTIONS}
        t={t}
        locale={locale}
      />

      <CompactPaymentList
        title={t("accounting.incomingTitle")}
        description={t("accounting.incomingDesc")}
        empty={t("accounting.incomingEmpty")}
        rows={report.incoming}
        countLabel={
          report.incoming.length === 1
            ? t("accounting.incomingCountOne")
            : t("accounting.incomingCountMany", { n: report.incoming.length })
        }
        canDelete={report.isGlobalAdmin}
        t={t}
      />

      <CompactPaymentList
        title={t("accounting.failedTitle")}
        description={t("accounting.failedDesc")}
        empty={t("accounting.failedEmpty")}
        rows={report.failed}
        countLabel={
          report.failed.length === 1
            ? t("accounting.failedCountOne")
            : t("accounting.failedCountMany", { n: report.failed.length })
        }
        t={t}
      />

      <BankTransferTable
        rows={report.bankTransfers}
        showSection={report.selectedKey === ALL_SECTIONS}
        collapsible
        t={t}
      />
    </div>
  );
}

function Stat({
  label,

  value,

  hint,
}: {
  label: string;

  value: string;

  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>

      <p className="mt-1 font-heading text-3xl">{value}</p>

      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function BreakdownCard({
  title,

  rows,

  t,
}: {
  title: string;

  rows: AccountingBreakdown[];

  t: TFunction;
}) {
  const max = Math.max(1, ...rows.map((row) => row.paidCents));

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 className="text-lg font-medium">{title}</h2>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("accounting.noData")}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{row.label}</span>

                <span>{formatEuro(row.paidCents)}</span>
              </div>

              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"

                  style={{
                    width: `${Math.round((row.paidCents / max) * 100)}%`,
                  }}
                />
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                {row.paidCount === 1
                  ? t("accounting.incomingCountOne")
                  : t("accounting.incomingCountMany", { n: row.paidCount })}

                {row.pendingCents > 0
                  ? ` Â· ${t("accounting.openPending", { amount: formatEuro(row.pendingCents) })}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonthBars({
  months,

  t,
}: {
  months: AccountingMonth[];

  t: TFunction;
}) {
  const max = Math.max(1, ...months.map((month) => month.paidCents));

  const hasData = months.some((month) => month.paidCents > 0);

  if (!hasData) {
    return (
      <p className="mt-4 rounded-2xl bg-card p-8 text-sm text-muted-foreground ring-1 ring-foreground/10">
        {t("accounting.monthsEmpty")}
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex h-44 min-w-[36rem] items-end gap-2">
        {months.map((month) => {
          const height =
            month.paidCents === 0
              ? 0
              : Math.max(8, (month.paidCents / max) * 100);

          return (
            <div
              key={month.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <p className="text-[10px] text-muted-foreground">
                {month.paidCents > 0 ? formatEuro(month.paidCents) : ""}
              </p>

              <div className="flex h-28 w-full items-end justify-center">
                <div
                  className="w-full rounded-t-md bg-primary"

                  style={{ height: `${height}%` }}

                  title={`${month.label}: ${formatEuro(month.paidCents)}`}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">{month.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BankTransferTable({
  rows,
  showSection,
  collapsible = false,
  t,
}: {
  rows: BankTransferRow[];
  showSection: boolean;
  collapsible?: boolean;
  t: TFunction;
}) {
  const countLabel =
    rows.length === 1
      ? t("accounting.bankTransfersCountOne")
      : t("accounting.bankTransfersCountMany", { n: rows.length });

  const body =
    rows.length === 0 ? (
      <p className="p-8 text-sm text-muted-foreground">
        {t("accounting.bankTransfersEmpty")}
      </p>
    ) : (
      <Table layout="fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[5.5rem]">{t("accounting.tableDate")}</TableHead>
            <TableHead className={tableCellTruncate}>
              {t("accounting.tableReference")}
            </TableHead>
            <TableHead className={tableCellTruncate}>
              {t("accounting.tableServices")}
            </TableHead>
            {showSection ? (
              <TableHead className={`w-[6rem] ${tableCellTruncate}`}>
                {t("accounting.tableSection")}
              </TableHead>
            ) : null}
            <TableHead className="w-[5.25rem]">{t("accounting.tableStatus")}</TableHead>
            <TableHead className="w-[4.75rem] text-right">
              {t("accounting.tableAmount")}
            </TableHead>
            <TableHead className={tableHeadActions} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.paymentReference}>
              <TableCell>{formatShortDate(row.createdAt)}</TableCell>
              <TableCell
                className={`font-mono text-xs ${tableCellTruncate}`}
                title={row.paymentReference}
              >
                {row.paymentReference}
              </TableCell>
              <TableCell>
                <ul className="grid gap-0.5 text-xs">
                  {row.items.map((item) => (
                    <li
                      key={item.id}
                      className={tableCellTruncate}
                      title={`${paymentPersonLabel(item.memberName, item.payerName, t)} – ${item.title}`}
                    >
                      {paymentPersonLabel(item.memberName, item.payerName, t)} –{" "}
                      {item.title}
                    </li>
                  ))}
                </ul>
              </TableCell>
              {showSection ? (
                <TableCell className={tableCellTruncate}>
                  {[...new Set(row.items.map((item) => item.sectionName))].join(
                    ", ",
                  )}
                </TableCell>
              ) : null}
              <TableCell className="text-xs">
                {row.pending
                  ? t("accounting.statusPending")
                  : t("accounting.statusPaid")}
              </TableCell>
              <TableCell className="text-right text-xs whitespace-nowrap">
                <p>{formatEuro(row.amountCents)}</p>
                {row.creditAppliedCents > 0 ? (
                  <p
                    className="mt-0.5 text-[0.65rem] text-muted-foreground"
                    title={t("accounting.bankTransferCreditNote", {
                      booking: formatEuro(row.bookingCents),
                      credit: formatEuro(row.creditAppliedCents),
                    })}
                  >
                    {t("accounting.bankTransferCreditHint", {
                      credit: formatEuro(row.creditAppliedCents),
                    })}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className={tableCellActions}>
                {row.pending && row.approveId ? (
                  <ApproveBankTransferButton
                    kind={row.approveKind}
                    id={row.approveId}
                  />
                ) : row.approvedAt ? (
                  <span className="text-xs text-muted-foreground">
                    {formatShortDate(row.approvedAt)}
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  if (collapsible) {
    return (
      <details className="group mt-12 rounded-2xl bg-card ring-1 ring-foreground/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="text-lg font-medium">
              {t("accounting.bankTransfersTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("accounting.bankTransfersDesc")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{countLabel}</p>
          </div>
          <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border">{body}</div>
      </details>
    );
  }

  return (
    <section className="mt-12">
      <h2 className="text-2xl">{t("accounting.bankTransfersTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("accounting.bankTransfersDesc")}
      </p>
      <div className="mt-4 rounded-2xl bg-card ring-1 ring-foreground/10">
        {body}
      </div>
    </section>
  );
}

/** Eingänge / Fehlschläge: wenige Spalten, auf dem Handy als Karten. */
function CompactPaymentList({
  title,
  description,
  empty,
  rows,
  countLabel,
  canDelete = false,
  className = "mt-12",
  t,
}: {
  title: string;
  description?: string;
  empty: string;
  rows: AccountingPayment[];
  countLabel?: string;
  canDelete?: boolean;
  className?: string;
  t: TFunction;
}) {
  const body =
    rows.length === 0 ? (
      <p className="p-8 text-sm text-muted-foreground">{empty}</p>
    ) : (
      <>
        <ul className="divide-y divide-border sm:hidden">
          {rows.map((row) => {
            const whenLabel = formatDateTime(row.paidAt ?? row.createdAt);
            const channelLabel = paymentChannelLabel(row, t);
            const statusLabel = paymentStatusLabel(row.status, t);
            const personLabel = paymentPersonLabel(
              row.memberName,
              row.payerName,
              t,
            );
            return (
              <li key={row.id} className="grid gap-1.5 px-4 py-3">
                <p className="font-medium break-words">{row.title}</p>
                <p className="text-sm break-words">{personLabel}</p>
                <p className="text-xs text-muted-foreground">{whenLabel}</p>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <p className="min-w-0 text-muted-foreground">
                    <span className="break-words">{channelLabel}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{statusLabel}</span>
                  </p>
                  <p className="shrink-0 font-medium tabular-nums">
                    {formatEuro(row.amountCents)}
                  </p>
                </div>
                {canDelete && row.status === "PAID" ? (
                  <DeleteAccountingPaymentButton
                    paymentKey={row.id}
                    title={row.title}
                    person={personLabel}
                    amount={formatEuro(row.amountCents)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">
                  {t("accounting.tableDateTime")}
                </TableHead>
                <TableHead>{t("accounting.tablePerson")}</TableHead>
                <TableHead>{t("accounting.tableService")}</TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("accounting.tableMethod")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("accounting.tableStatus")}
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  {t("accounting.tableAmount")}
                </TableHead>
                {canDelete ? (
                  <TableHead className={tableHeadActions} />
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const whenLabel = formatDateTime(row.paidAt ?? row.createdAt);
                const channelLabel = paymentChannelLabel(row, t);
                const personLabel = paymentPersonLabel(
                  row.memberName,
                  row.payerName,
                  t,
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
                      {whenLabel}
                    </TableCell>
                    <TableCell
                      className="align-top break-words"
                      title={personLabel}
                    >
                      {personLabel}
                    </TableCell>
                    <TableCell className="align-top font-medium break-words">
                      {row.title}
                    </TableCell>
                    <TableCell className="align-top text-sm break-words">
                      {channelLabel}
                    </TableCell>
                    <TableCell className="align-top text-sm whitespace-nowrap">
                      {paymentStatusLabel(row.status, t)}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm font-medium whitespace-nowrap tabular-nums">
                      {formatEuro(row.amountCents)}
                    </TableCell>
                    {canDelete ? (
                      <TableCell className={tableCellActions}>
                        {row.status === "PAID" ? (
                          <DeleteAccountingPaymentButton
                            paymentKey={row.id}
                            title={row.title}
                            person={personLabel}
                            amount={formatEuro(row.amountCents)}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </>
    );

  return (
    <details className={`group rounded-2xl bg-card ring-1 ring-foreground/10 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
          {countLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">{countLabel}</p>
          ) : null}
        </div>
        <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border">{body}</div>
    </details>
  );
}

function PaymentTable({
  title,
  description,
  empty,
  rows,
  showSection,
  pending = false,
  t,
}: {
  title: string;
  description?: string;
  empty: string;
  rows: AccountingPayment[];
  showSection: boolean;
  pending?: boolean;
  t: TFunction;
}) {
  const colTruncate = tableCellTruncate;

  return (
    <section className="mt-12">
      <h2 className="text-2xl">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">
                  {pending
                    ? t("accounting.tableDate")
                    : t("accounting.tableDateTime")}
                </TableHead>
                <TableHead>{t("accounting.tablePerson")}</TableHead>
                <TableHead>{t("accounting.tableService")}</TableHead>
                {showSection ? (
                  <TableHead>{t("accounting.tableSection")}</TableHead>
                ) : null}
                <TableHead className="whitespace-nowrap">
                  {t("accounting.tableKind")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("accounting.tableMethod")}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("accounting.tableStatus")}
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  {t("accounting.tableAmount")}
                </TableHead>
                {pending ? (
                  <TableHead className={tableHeadActions}>
                    {t("accounting.tableActions")}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const when = row.paidAt ?? row.createdAt;
                const whenLabel = pending
                  ? formatShortDate(when)
                  : formatDateTime(when);
                const channelLabel = paymentChannelLabel(row, t);

                return (
                  <TableRow key={row.id}>
                    <TableCell
                      className="text-xs whitespace-nowrap"
                      title={whenLabel}
                    >
                      {whenLabel}
                    </TableCell>
                    <TableCell
                      className={colTruncate}
                      title={paymentPersonLabel(row.memberName, row.payerName, t)}
                    >
                      {paymentPersonLabel(row.memberName, row.payerName, t)}
                    </TableCell>
                    <TableCell
                      className={`font-medium ${colTruncate}`}
                      title={row.title}
                    >
                      {row.title}
                    </TableCell>
                    {showSection ? (
                      <TableCell className={colTruncate} title={row.sectionName}>
                        {row.sectionName}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-xs whitespace-nowrap">
                      {paymentKindLabel(row.kind, t)}
                    </TableCell>
                    <TableCell
                      className={`text-xs ${colTruncate}`}
                      title={channelLabel}
                    >
                      {channelLabel}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {paymentStatusLabel(row.status, t)}
                    </TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">
                      {pending ? (
                        <>
                          <p>{formatEuro(paymentExternalCents(row))}</p>
                          {row.creditAppliedCents > 0 ? (
                            <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                              {t("accounting.bankTransferCreditHint", {
                                credit: formatEuro(row.creditAppliedCents),
                              })}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        formatEuro(row.amountCents)
                      )}
                    </TableCell>
                    {pending ? (
                      <TableCell className={tableCellActions}>
                        {row.approveKind && row.approveId ? (
                          <ApproveBankTransferButton
                            kind={row.approveKind}
                            id={row.approveId}
                            label={t("accounting.approve")}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

function PendingRefundTable({
  title,
  description,
  empty,
  rows,
  showSection,
  t,
  locale,
}: {
  title: string;
  description: string;
  empty: string;
  rows: PendingRefundAccountingRow[];
  showSection: boolean;
  t: TFunction;
  locale: "de" | "it";
}) {
  const colTruncate = tableCellTruncate;

  return (
    <section className="mt-12">
      <h2 className="text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 rounded-2xl bg-card ring-1 ring-foreground/10">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table layout="fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[7.25rem]">
                  {t("accounting.tableDate")}
                </TableHead>
                <TableHead className={colTruncate}>
                  {t("accounting.tablePerson")}
                </TableHead>
                <TableHead className={colTruncate}>
                  {t("accounting.tableService")}
                </TableHead>
                {showSection ? (
                  <TableHead className={`w-[6.5rem] ${colTruncate}`}>
                    {t("accounting.tableSection")}
                  </TableHead>
                ) : null}
                <TableHead className="w-[5.5rem]">
                  {t("accounting.tableKind")}
                </TableHead>
                <TableHead className={`w-[6.75rem] ${colTruncate}`}>
                  {t("accounting.tableMethod")}
                </TableHead>
                <TableHead className="w-[5.5rem] text-right">
                  {t("accounting.tableRefundAmount")}
                </TableHead>
                <TableHead className={tableHeadActions}>
                  {t("accounting.tableActions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const methodLabel =
                  row.paymentMethod === "STRIPE"
                    ? t("accounting.channelCard")
                    : row.paymentMethod === "BANK_TRANSFER"
                      ? t("accounting.channelTransfer")
                      : "—";
                const kindLabel =
                  row.kind === "course"
                    ? t("accounting.kindCourse")
                    : row.kind === "device"
                      ? t("accounting.kindDevice")
                      : t("accounting.kindAddon");
                const amountTitle =
                  row.paymentMethod === "STRIPE"
                    ? t("accounting.pendingRefundStripeHint", {
                        gross: formatEuro(row.externalCents, locale),
                        fees: formatEuro(row.stripeFeeCents, locale),
                      })
                    : t("accounting.pendingRefundBankHint");

                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatShortDate(row.createdAt)}
                    </TableCell>
                    <TableCell
                      className={colTruncate}
                      title={paymentPersonLabel(row.memberName, row.payerName, t)}
                    >
                      {paymentPersonLabel(row.memberName, row.payerName, t)}
                    </TableCell>
                    <TableCell className={`font-medium ${colTruncate}`} title={row.title}>
                      {row.title}
                    </TableCell>
                    {showSection ? (
                      <TableCell className={colTruncate} title={row.sectionName}>
                        {row.sectionName}
                      </TableCell>
                    ) : null}
                    <TableCell>{kindLabel}</TableCell>
                    <TableCell className={colTruncate} title={methodLabel}>
                      {methodLabel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" title={amountTitle}>
                      {formatEuro(row.payoutCents, locale)}
                    </TableCell>
                    <TableCell className={tableCellActions}>
                      <ConfirmPendingRefundButton id={row.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
