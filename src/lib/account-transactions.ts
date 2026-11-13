import { accountingAmountCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { formatSlotDate, formatSlotTime } from "@/lib/booking";
import { importPaidStripeInvoicePayments } from "@/lib/stripe-subscription-cancel";
import type { AccountLedgerItem } from "@/lib/account-transaction-types";
export type { AccountLedgerItem, AccountLedgerKind } from "@/lib/account-transaction-types";

function slotTitle(name: string, startsAt: Date, endsAt: Date) {
  return `${name} · ${formatSlotDate(startsAt)} ${formatSlotTime(startsAt)}–${formatSlotTime(endsAt)}`;
}

function mine(userId: string) {
  return { OR: [{ userId }, { purchasedById: userId }] };
}

export async function getAccountTransactions(
  userId: string,
  selfName: string,
): Promise<AccountLedgerItem[]> {
  await importPaidStripeInvoicePayments({ userId }).catch((error) => {
    console.error("Stripe-Rechnungen in Transaktionen", userId, error);
  });

  const [enrollments, subscriptions, subscriptionPayments, courts, devices, credits] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: mine(userId),
        select: {
          id: true,
          status: true,
          paidAt: true,
          paidCents: true,
          creditAppliedCents: true,
          createdAt: true,
          paymentMethod: true,
          stripeSessionId: true,
          bankTransferApprovedAt: true,
          userId: true,
          user: { select: { name: true } },
          course: { select: { title: true, priceCents: true } },
        },
      }),
      prisma.subscription.findMany({
        where: mine(userId),
        select: {
          id: true,
          status: true,
          paidAt: true,
          paidCents: true,
          creditAppliedCents: true,
          createdAt: true,
          paymentMethod: true,
          stripeSessionId: true,
          bankTransferApprovedAt: true,
          userId: true,
          user: { select: { name: true } },
          plan: { select: { title: true, priceCents: true, kind: true } },
        },
      }),
      prisma.subscriptionPayment.findMany({
        where: { subscription: mine(userId) },
        select: {
          id: true,
          subscriptionId: true,
          amountCents: true,
          paidAt: true,
          source: true,
          subscription: {
            select: {
              creditAppliedCents: true,
              paymentMethod: true,
              stripeSessionId: true,
              bankTransferApprovedAt: true,
              userId: true,
              user: { select: { name: true } },
              plan: { select: { title: true, priceCents: true, kind: true } },
            },
          },
        },
      }),
      prisma.courtReservation.findMany({
        where: { userId, priceCents: { gt: 0 } },
        select: {
          id: true,
          status: true,
          paidAt: true,
          priceCents: true,
          creditAppliedCents: true,
          createdAt: true,
          stripeSessionId: true,
          startsAt: true,
          endsAt: true,
          court: { select: { name: true } },
        },
      }),
      prisma.deviceReservation.findMany({
        where: { userId, priceCents: { gt: 0 } },
        select: {
          id: true,
          status: true,
          paidAt: true,
          priceCents: true,
          creditAppliedCents: true,
          createdAt: true,
          stripeSessionId: true,
          startsAt: true,
          endsAt: true,
          device: { select: { name: true } },
        },
      }),
      prisma.creditTransaction.findMany({
        where: { userId, kind: "REFUND" },
        select: {
          id: true,
          amountCents: true,
          description: true,
          createdAt: true,
        },
      }),
    ]);

  const rows: AccountLedgerItem[] = [];

  for (const item of enrollments) {
    const pending = item.status === "PENDING" && item.paymentMethod === "BANK_TRANSFER";
    const settled =
      item.status === "PAID" ||
      (item.status === "CANCELLED" && item.paidAt != null);
    if (!settled && !pending) continue;
    const amount = accountingAmountCents(
      item.paidCents,
      item.course.priceCents,
      pending,
    );
    if (amount <= 0) continue;
    rows.push({
      id: `course-${item.id}`,
      at: item.paidAt ?? item.createdAt,
      kind: "course",
      title: item.course.title,
      memberName: item.user.name,
      signedCents: -amount,
      payment: {
        paymentMethod: item.paymentMethod,
        creditAppliedCents: item.creditAppliedCents,
        paidCents: item.paidCents,
        listPriceCents: item.course.priceCents,
        bankTransferApprovedAt: item.bankTransferApprovedAt,
        stripeSessionId: item.stripeSessionId,
        settled,
      },
    });
  }

  const idsWithInitialPayment = new Set(
    subscriptionPayments
      .filter(
        (item) =>
          item.source === "checkout" || item.source === "bank_transfer",
      )
      .map((item) => item.subscriptionId),
  );

  for (const item of subscriptions) {
    if (idsWithInitialPayment.has(item.id)) continue;
    const pending = item.status === "PENDING" && item.paymentMethod === "BANK_TRANSFER";
    const settled =
      item.status === "ACTIVE" ||
      (item.status === "CANCELLED" && item.paidAt != null);
    if (!settled && !pending) continue;
    const amount = accountingAmountCents(
      item.paidCents,
      item.plan.priceCents,
      pending,
    );
    if (amount <= 0) continue;
    rows.push({
      id: `plan-${item.id}`,
      at: item.paidAt ?? item.createdAt,
      kind: item.plan.kind === "MEMBERSHIP" ? "membership" : "addon",
      title: item.plan.title,
      memberName: item.user.name,
      signedCents: -amount,
      payment: {
        paymentMethod: item.paymentMethod,
        creditAppliedCents: item.creditAppliedCents,
        paidCents: item.paidCents,
        listPriceCents: item.plan.priceCents,
        bankTransferApprovedAt: item.bankTransferApprovedAt,
        stripeSessionId: item.stripeSessionId,
        settled,
      },
    });
  }

  for (const item of subscriptionPayments) {
    const credit =
      item.source === "checkout" || item.source === "bank_transfer"
        ? Math.max(0, item.subscription.creditAppliedCents)
        : 0;
    const amount = item.amountCents + credit;
    if (amount <= 0) continue;
    const renewal = item.source === "renewal" || item.source === "stripe_invoice";
    rows.push({
      id: `plan-pay-${item.id}`,
      at: item.paidAt,
      kind:
        item.subscription.plan.kind === "MEMBERSHIP" ? "membership" : "addon",
      title: item.subscription.plan.title,
      renewal,
      memberName: item.subscription.user.name,
      signedCents: -amount,
      payment: {
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
    });
  }

  for (const item of courts) {
    const pending = item.status === "PENDING";
    const settled =
      item.status === "CONFIRMED" ||
      (item.status === "CANCELLED" && item.paidAt != null);
    if (!settled && !pending) continue;
    rows.push({
      id: `court-${item.id}`,
      at: item.paidAt ?? item.createdAt,
      kind: "court",
      title: slotTitle(item.court.name, item.startsAt, item.endsAt),
      memberName: selfName,
      signedCents: -item.priceCents,
      payment: {
        paymentMethod: item.stripeSessionId ? "STRIPE" : null,
        creditAppliedCents: item.creditAppliedCents,
        paidCents: item.priceCents,
        listPriceCents: item.priceCents,
        bankTransferApprovedAt: null,
        stripeSessionId: item.stripeSessionId,
        settled,
      },
    });
  }

  for (const item of devices) {
    const pending = item.status === "PENDING";
    const settled =
      item.status === "CONFIRMED" ||
      (item.status === "CANCELLED" && item.paidAt != null);
    if (!settled && !pending) continue;
    rows.push({
      id: `device-${item.id}`,
      at: item.paidAt ?? item.createdAt,
      kind: "device",
      title: slotTitle(item.device.name, item.startsAt, item.endsAt),
      memberName: selfName,
      signedCents: -item.priceCents,
      payment: {
        paymentMethod: item.stripeSessionId ? "STRIPE" : null,
        creditAppliedCents: item.creditAppliedCents,
        paidCents: item.priceCents,
        listPriceCents: item.priceCents,
        bankTransferApprovedAt: null,
        stripeSessionId: item.stripeSessionId,
        settled,
      },
    });
  }

  for (const item of credits) {
    if (item.amountCents <= 0) continue;
    rows.push({
      id: `credit-${item.id}`,
      at: item.createdAt,
      kind: "credit",
      title: item.description,
      memberName: selfName,
      signedCents: item.amountCents,
      payment: null,
    });
  }

  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows;
}
