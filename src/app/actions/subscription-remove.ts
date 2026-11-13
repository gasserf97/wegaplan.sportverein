"use server";

import type { PaymentMethod } from "@/generated/prisma/client";
import { requireCourseManager } from "@/lib/auth";
import { cancelledSubscriptionData } from "@/lib/expire-pending";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { cashRefundPayoutCents } from "@/lib/pending-refund";
import { canManagePlan } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidateSubscriptionViews } from "@/lib/revalidate-subscriptions";
import {
  isStripeSubscriptionGone,
  syncStripeRecurringToLocalAutoRenew,
} from "@/lib/stripe-subscription-cancel";
import { isSubscriptionPeriodValid } from "@/lib/subscriptions";

type RemoveSubscriptionResult =
  | { ok: true; creditedCents: number; pendingRefundCents: number }
  | { error: string };

function paymentMethodForRefund(
  source: string | null | undefined,
  fallback: PaymentMethod | null,
): PaymentMethod | null {
  if (source === "bank_transfer") return "BANK_TRANSFER";
  if (
    source === "checkout" ||
    source === "renewal" ||
    source === "stripe_invoice" ||
    source === "demo"
  ) {
    return "STRIPE";
  }
  return fallback;
}

export async function removeSubscriptionUserAction(
  subscriptionId: string,
): Promise<RemoveSubscriptionResult> {
  const manager = await requireCourseManager();
  if (!manager) return { error: "Keine Berechtigung." };

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      user: { select: { name: true } },
      purchasedBy: { select: { name: true } },
      payments: {
        orderBy: { paidAt: "desc" },
        take: 1,
      },
    },
  });

  if (!subscription) return { error: "Mitgliedschaftsanmeldung nicht gefunden." };
  if (!(await canManagePlan(manager.id, subscription.plan))) {
    return { error: "Keine Berechtigung für diese Mitgliedschaft." };
  }
  if (subscription.status === "CANCELLED") {
    return { error: "Diese Mitgliedschaftsanmeldung wurde bereits entfernt." };
  }
  if (
    subscription.status === "ACTIVE" &&
    !isSubscriptionPeriodValid(subscription.periodEnd)
  ) {
    return {
      error:
        "Abgelaufene Mitgliedschaftsanmeldungen können nicht erstattet werden.",
    };
  }
  if (
    subscription.status !== "ACTIVE" &&
    subscription.status !== "SCHEDULED" &&
    subscription.status !== "PENDING"
  ) {
    return { error: "Diese Mitgliedschaftsanmeldung kann nicht entfernt werden." };
  }

  const existingRefund = await prisma.pendingRefundTransfer.findFirst({
    where: { subscriptionId: subscription.id, status: "PENDING" },
    select: { id: true },
  });
  if (existingRefund) {
    return {
      error:
        "Für diese Mitgliedschaftsanmeldung ist bereits eine Rücküberweisung vorgemerkt.",
    };
  }

  const creditRecipientId =
    subscription.purchasedById ?? subscription.userId;

  if (subscription.status === "PENDING") {
    const reservedCredit =
      subscription.paymentMethod === "BANK_TRANSFER" &&
      subscription.creditAppliedCents > 0
        ? await prisma.creditTransaction.findFirst({
            where: { subscriptionId: subscription.id, kind: "PAYMENT" },
            select: { id: true },
          })
        : null;
    const creditedCents = reservedCredit
      ? subscription.creditAppliedCents
      : 0;
    const cancelled = await prisma.$transaction(async (tx) => {
      const claimed = await tx.subscription.updateMany({
        where: { id: subscription.id, status: "PENDING" },
        data: cancelledSubscriptionData,
      });
      if (claimed.count === 0) return false;

      if (creditedCents > 0) {
        await tx.user.update({
          where: { id: creditRecipientId },
          data: { creditBalanceCents: { increment: creditedCents } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: creditRecipientId,
            amountCents: creditedCents,
            kind: "REFUND",
            description: `Stornierung: ${subscription.plan.title}`,
            subscriptionId: subscription.id,
          },
        });
      }
      return true;
    });
    if (!cancelled) {
      return { error: "Diese Mitgliedschaftsanmeldung wurde bereits entfernt." };
    }

    revalidateSubscriptionViews(subscription.planId);
    return { ok: true, creditedCents, pendingRefundCents: 0 };
  }

  if (subscription.status === "SCHEDULED") {
    const cancelled = await prisma.subscription.updateMany({
      where: { id: subscription.id, status: "SCHEDULED" },
      data: {
        status: "CANCELLED",
        autoRenew: false,
        prepaidRenewalCredits: 0,
      },
    });
    if (cancelled.count === 0) {
      return { error: "Diese Mitgliedschaftsanmeldung wurde bereits entfernt." };
    }

    revalidateSubscriptionViews(subscription.planId);
    return { ok: true, creditedCents: 0, pendingRefundCents: 0 };
  }

  if (
    subscription.stripeSubscriptionId ||
    subscription.stripeSessionId
  ) {
    try {
      await syncStripeRecurringToLocalAutoRenew({
        id: subscription.id,
        autoRenew: false,
        periodEnd: subscription.periodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeSessionId: subscription.stripeSessionId,
      });
    } catch (error) {
      if (!isStripeSubscriptionGone(error)) {
        console.error("Abo beim Entfernen bei Stripe beenden", error);
        return {
          error:
            "Die laufende Stripe-Mitgliedschaft konnte nicht beendet werden. Bitte später erneut versuchen.",
        };
      }
    }
  }

  const latestPayment = subscription.payments[0];
  const isInitialPayment =
    latestPayment?.source === "checkout" ||
    latestPayment?.source === "bank_transfer";
  const creditedCents = latestPayment
    ? latestPayment.amountCents +
      (isInitialPayment ? subscription.creditAppliedCents : 0)
    : subscription.paidCents ?? subscription.plan.priceCents;
  const externalCents = latestPayment
    ? latestPayment.amountCents
    : externalPaymentDueCents(
        subscription.paidCents,
        subscription.plan.priceCents,
        subscription.creditAppliedCents,
        false,
      );
  const refundPaymentMethod = paymentMethodForRefund(
    latestPayment?.source,
    subscription.paymentMethod,
  );
  const { payoutCents, feeCents } = cashRefundPayoutCents({
    paymentMethod: refundPaymentMethod,
    externalCents,
    stripeFeeCents: latestPayment?.stripeFeeCents,
    stripeSessionId: subscription.stripeSessionId,
  });

  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      const claimed = await tx.subscription.updateMany({
        where: { id: subscription.id, status: "ACTIVE" },
        data: {
          status: "CANCELLED",
          autoRenew: false,
          stripeSubscriptionId: null,
          stripeSessionId: null,
        },
      });
      if (claimed.count === 0) return false;

      if (creditedCents > 0) {
        await tx.user.update({
          where: { id: creditRecipientId },
          data: { creditBalanceCents: { increment: creditedCents } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: creditRecipientId,
            amountCents: creditedCents,
            kind: "REFUND",
            description: `Stornierung: ${subscription.plan.title}`,
            subscriptionId: subscription.id,
          },
        });
      }

      if (payoutCents > 0) {
        await tx.pendingRefundTransfer.create({
          data: {
            userId: creditRecipientId,
            kind: "SUBSCRIPTION",
            title: subscription.plan.title,
            sectionId: subscription.plan.sectionId,
            memberName: subscription.user.name,
            payerName: subscription.purchasedBy?.name ?? null,
            paymentMethod: refundPaymentMethod,
            externalCents,
            stripeFeeCents: feeCents,
            payoutCents,
            creditedCents: externalCents,
            subscriptionId: subscription.id,
          },
        });
      }
      return true;
    });
    if (!cancelled) {
      return { error: "Diese Mitgliedschaftsanmeldung wurde bereits entfernt." };
    }
  } catch (error) {
    console.error("Abo-Anmeldung entfernen", subscription.id, error);
    return {
      error:
        "Die Mitgliedschaft konnte nicht entfernt werden. Bitte später erneut versuchen.",
    };
  }

  revalidateSubscriptionViews(subscription.planId);
  return {
    ok: true,
    creditedCents,
    pendingRefundCents: payoutCents,
  };
}
