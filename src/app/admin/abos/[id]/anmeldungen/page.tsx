import type { Metadata } from "next";
import type { PaymentMethod } from "@/generated/prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RemoveSubscriptionUserButton } from "@/components/remove-subscription-user-button";
import { ResendMembershipCardButton } from "@/components/resend-membership-card-button";
import { Badge } from "@/components/ui/badge";
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
import { requireCourseManager } from "@/lib/auth";
import { expireStalePendingSubscriptions } from "@/lib/expire-pending";
import {
  stopEndedStripeRecurring,
  syncActiveStripeRecurringPeriods,
} from "@/lib/stripe-subscription-cancel";
import { formatDate, formatDateTime, formatEuro, formatShortDate } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n";
import type { Locale, TFunction } from "@/lib/i18n/types";
import { canManagePlan } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { registrationPaymentLabel } from "@/lib/registration-payment";
import {
  currentAdminSubscriptionFilter,
  isSubscriptionPeriodValid,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  id: string;
  status: string;
  autoRenew: boolean;
  periodEnd: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  paymentMethod: PaymentMethod | null;
  creditAppliedCents: number;
  paidCents: number | null;
  bankTransferApprovedAt: Date | null;
  stripeSessionId: string | null;
  user: { name: string; email: string };
  purchasedBy: { name: string } | null;
  payments: Array<{ amountCents: number; source: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { t } = await getServerI18n();
  const { id } = await params;
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  return {
    title: plan
      ? `${t("admin.attestations")} · ${plan.title}`
      : t("admin.attestations"),
  };
}

export default async function PlanEnrollmentsAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const manager = await requireCourseManager();
  if (!manager) redirect("/anmelden?next=/admin/abos");

  await expireStalePendingSubscriptions();
  await stopEndedStripeRecurring();
  await syncActiveStripeRecurringPeriods();

  const { id } = await params;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) notFound();
  if (!(await canManagePlan(manager.id, plan))) redirect("/admin/abos");

  const now = new Date();
  const include = {
    user: { select: { name: true, email: true } },
    purchasedBy: { select: { name: true } },
    payments: {
      orderBy: { paidAt: "desc" as const },
      take: 1,
      select: { amountCents: true, source: true },
    },
  } as const;
  const orderBy = [
    { paidAt: { sort: "desc" as const, nulls: "last" as const } },
    { createdAt: "desc" as const },
  ];

  const [current, expired] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        planId: plan.id,
        ...currentAdminSubscriptionFilter(now),
      },
      orderBy,
      include,
    }),
    prisma.subscription.findMany({
      where: {
        planId: plan.id,
        status: "ACTIVE",
        periodEnd: { lt: now },
      },
      orderBy,
      include,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Link href="/admin/abos" className="text-sm underline">
        ← {t("admin.subscriptionsTitle")}
      </Link>
      {" · "}
      <Link href={`/admin/abos/${plan.id}`} className="text-sm underline">
        {t("admin.edit")}
      </Link>
      <h1 className="mt-4 text-4xl">{t("admin.attestations")}</h1>
      <p className="mt-2 text-muted-foreground">{plan.title}</p>

      {current.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          {t("admin.planEnrollmentsEmpty")}
        </p>
      ) : (
        <EnrollmentTable
          rows={current}
          planPriceCents={plan.priceCents}
          showMembershipCardActions={plan.kind === "MEMBERSHIP"}
          locale={locale}
          t={t}
        />
      )}

      {expired.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t("admin.planEnrollmentsPast", { n: expired.length })}
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("admin.planEnrollmentsPastHint")}
          </p>
          <EnrollmentTable
            rows={expired}
            planPriceCents={plan.priceCents}
            showMembershipCardActions={plan.kind === "MEMBERSHIP"}
            locale={locale}
            t={t}
          />
        </details>
      ) : null}

      <p className="mt-4 text-sm text-muted-foreground">
        {plan.priceCents === 0
          ? t("common.free")
          : t("admin.planPricePerPerson", {
              price: formatEuro(plan.priceCents, locale),
            })}
      </p>
    </div>
  );
}

function EnrollmentTable({
  rows,
  planPriceCents,
  showMembershipCardActions,
  locale,
  t,
}: {
  rows: EnrollmentRow[];
  planPriceCents: number;
  showMembershipCardActions: boolean;
  locale: Locale;
  t: TFunction;
}) {
  function pendingRefundCents(item: EnrollmentRow) {
    if (item.status !== "ACTIVE") return 0;
    const latestPayment = item.payments[0];
    if (latestPayment) return latestPayment.amountCents;
    return Math.max(
      0,
      (item.paidCents ?? planPriceCents) - item.creditAppliedCents,
    );
  }

  return (
    <div className="mt-8 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.member")}</TableHead>
            <TableHead className={tableCellTruncate}>
              {t("admin.tableBookedBy")}
            </TableHead>
            <TableHead>{t("admin.tableStatus")}</TableHead>
            <TableHead>{t("admin.tablePayment")}</TableHead>
            <TableHead>{t("admin.tableAutoRenew")}</TableHead>
            <TableHead>{t("admin.tableValidUntil")}</TableHead>
            <TableHead>{t("common.date")}</TableHead>
            <TableHead className={tableHeadActions}>
              {t("admin.tableActions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const valid = isSubscriptionPeriodValid(item.periodEnd);
            const settled = item.status === "ACTIVE";
            const statusLabel = settled
              ? valid
                ? t("subscriptions.badgeActive")
                : t("subscriptions.badgeExpired")
              : item.status === "SCHEDULED"
                ? t("subscriptions.badgeScheduled")
              : t("courses.catalogBadgePaymentUnconfirmed");
            const when = item.paidAt ?? item.createdAt;
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <div>{item.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.user.email}
                  </div>
                </TableCell>
                <TableCell className={tableCellTruncate}>
                  {item.purchasedBy?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={settled && valid ? "default" : "secondary"}>
                    {statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {registrationPaymentLabel(
                    {
                      paymentMethod: item.paymentMethod,
                      creditAppliedCents: item.creditAppliedCents,
                      paidCents: item.paidCents,
                      listPriceCents: planPriceCents,
                      bankTransferApprovedAt: item.bankTransferApprovedAt,
                      stripeSessionId: item.stripeSessionId,
                      settled,
                    },
                    t,
                  ) ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {item.autoRenew ? t("common.yes") : t("common.no")}
                </TableCell>
                <TableCell className="text-sm">
                  {item.periodEnd ? formatDate(item.periodEnd, locale) : "—"}
                </TableCell>
                <TableCell title={formatDateTime(when, locale)}>
                  {formatShortDate(when, locale)}
                </TableCell>
                <TableCell className={tableCellActions}>
                  <div className="flex flex-wrap justify-end gap-2">
                    {(settled && valid) ||
                    item.status === "SCHEDULED" ||
                    item.status === "PENDING" ? (
                      <RemoveSubscriptionUserButton
                        subscriptionId={item.id}
                        memberName={item.user.name}
                        pendingRefundCents={pendingRefundCents(item)}
                      />
                    ) : null}
                    {showMembershipCardActions &&
                    (item.status === "ACTIVE" ||
                      item.status === "SCHEDULED") ? (
                      <ResendMembershipCardButton
                        subscriptionId={item.id}
                        compact
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
