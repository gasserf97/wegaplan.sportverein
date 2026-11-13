import type { AdminRecentRegistrationItem } from "@/components/admin-recent-registrations";
import { formatDateTime, formatEuro } from "@/lib/format";
import type { Locale, TFunction } from "@/lib/i18n/types";
import { accountingAmountCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { registrationPaymentLabel } from "@/lib/registration-payment";
import { importPaidStripeInvoicePayments } from "@/lib/stripe-subscription-cancel";
import type { Prisma } from "@/generated/prisma/client";

const RECENT_LIMIT = 20;

export async function getAdminRecentSubscriptionTransactionRows(
  subscriptionWhere: Prisma.SubscriptionWhereInput,
  locale: Locale,
  t: TFunction,
  take = RECENT_LIMIT,
): Promise<Array<{ at: Date; item: AdminRecentRegistrationItem }>> {
  await importPaidStripeInvoicePayments({
    subscriptionWhere,
  }).catch((error) => {
    console.error("Stripe-Rechnungen in Admin-Transaktionen", error);
  });

  const unlimited = take >= Number.MAX_SAFE_INTEGER;
  const [payments, subscriptions] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: { subscription: subscriptionWhere },
      orderBy: { paidAt: "desc" },
      ...(unlimited ? {} : { take }),
      include: {
        subscription: {
          include: { user: true, plan: true },
        },
      },
    }),
    prisma.subscription.findMany({
      where: {
        AND: [
          subscriptionWhere,
          {
            status: {
              in: ["PENDING", "ACTIVE", "CANCELLED"],
            },
          },
        ],
      },
      include: {
        user: true,
        plan: true,
        payments: {
          where: { source: { in: ["checkout", "bank_transfer"] } },
          select: { source: true },
          take: 1,
        },
      },
      orderBy: [
        { paidAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      ...(unlimited ? {} : { take }),
    }),
  ]);

  const rows: Array<{ at: Date; item: AdminRecentRegistrationItem }> = [];

  for (const item of payments) {
    const credit =
      item.source === "checkout" || item.source === "bank_transfer"
        ? Math.max(0, item.subscription.creditAppliedCents)
        : 0;
    const amount = item.amountCents + credit;
    const courseBundle = item.source === "course_bundle";
    if (amount <= 0 && !courseBundle) continue;
    const renewal =
      item.source === "renewal" || item.source === "stripe_invoice";
    const title = renewal
      ? `${item.subscription.plan.title} (${t("account.txRenewal")})`
      : courseBundle
        ? `${item.subscription.plan.title} (${t("account.txCourseBundle")})`
        : item.subscription.plan.title;
    rows.push({
      at: item.paidAt,
      item: {
        id: `pay-${item.id}`,
        personName: item.subscription.user.name,
        title,
        statusLabel: t("common.paid"),
        statusSettled: true,
        paymentLabel: registrationPaymentLabel(
          {
            paymentMethod:
              item.source === "bank_transfer"
                ? "BANK_TRANSFER"
                : item.subscription.paymentMethod,
            creditAppliedCents: credit,
            paidCents: amount,
            listPriceCents: item.subscription.plan.priceCents,
            bankTransferApprovedAt: item.subscription.bankTransferApprovedAt,
            stripeSessionId: item.subscription.stripeSessionId,
            settled: true,
          },
          t,
        ),
        whenLabel: formatDateTime(item.paidAt, locale),
        amountLabel: formatEuro(amount, locale),
      },
    });
  }

  const idsWithInitialPayment = new Set(
    payments
      .filter(
        (item) =>
          item.source === "checkout" || item.source === "bank_transfer",
      )
      .map((item) => item.subscriptionId),
  );

  for (const item of subscriptions) {
    const hasInitial =
      idsWithInitialPayment.has(item.id) ||
      item.payments.some(
        (payment) =>
          payment.source === "checkout" || payment.source === "bank_transfer",
      );
    if (hasInitial) continue;
    // Wie bei Kursen: keine angefangenen/abgebrochenen Checkouts
    // (Kartenabbruch, Verlängerung ohne Zahlung, …).
    const incompletePending =
      item.status === "PENDING" && item.paymentMethod !== "BANK_TRANSFER";
    const unpaidCancel = item.status === "CANCELLED" && !item.paidAt;
    if (incompletePending || unpaidCancel) continue;

    const pending = item.status === "PENDING";
    const settled = item.status === "ACTIVE";
    const cancelled = item.status === "CANCELLED";
    const amount = accountingAmountCents(
      item.paidCents,
      item.plan.priceCents,
      pending,
    );
    if (amount <= 0 && !cancelled) continue;
    const when = item.paidAt ?? item.createdAt;
    rows.push({
      at: when,
      item: {
        id: item.id,
        personName: item.user.name,
        title: item.plan.title,
        statusLabel: settled
          ? t("common.paid")
          : cancelled
            ? t("common.cancelled")
            : t("common.open"),
        statusSettled: settled,
        paymentLabel: registrationPaymentLabel(
          {
            paymentMethod: item.paymentMethod,
            creditAppliedCents: item.creditAppliedCents,
            paidCents: item.paidCents,
            listPriceCents: item.plan.priceCents,
            bankTransferApprovedAt: item.bankTransferApprovedAt,
            stripeSessionId: item.stripeSessionId,
            settled,
          },
          t,
        ),
        whenLabel: formatDateTime(when, locale),
        amountLabel:
          amount > 0 ? formatEuro(amount, locale) : null,
      },
    });
  }

  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return unlimited ? rows : rows.slice(0, take);
}

export async function getAdminRecentSubscriptionTransactions(
  subscriptionWhere: Prisma.SubscriptionWhereInput,
  locale: Locale,
  t: TFunction,
  take = RECENT_LIMIT,
): Promise<AdminRecentRegistrationItem[]> {
  const rows = await getAdminRecentSubscriptionTransactionRows(
    subscriptionWhere,
    locale,
    t,
    take,
  );
  return rows.map((row) => row.item);
}
