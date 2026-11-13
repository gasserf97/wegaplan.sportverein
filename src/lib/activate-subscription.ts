import { sendSubscriptionConfirmation } from "@/lib/booking-confirmation";
import { sendMembershipCardForSubscription } from "@/lib/membership-card";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { revalidateSubscriptionViews } from "@/lib/revalidate-subscriptions";
import { recordSubscriptionPayment } from "@/lib/subscription-payments";
import {
  initialSubscriptionPeriod,
  isSubscriptionPeriodValid,
} from "@/lib/subscriptions";

async function ensureMembershipCardEmail(
  subscriptionId: string,
  planKind: string,
) {
  if (planKind !== "MEMBERSHIP") {
    return { sent: false as const, membershipCard: false };
  }
  try {
    const result = await sendMembershipCardForSubscription(subscriptionId);
    if (!result.sent) {
      console.error("Mitgliedskarte E-Mail", subscriptionId, result.message);
    }
    return {
      sent: result.sent,
      membershipCard: true as const,
      message: "message" in result ? result.message : undefined,
    };
  } catch (error) {
    console.error("Mitgliedskarte E-Mail", subscriptionId, error);
    return { sent: false as const, membershipCard: true as const };
  }
}

export type ActivateSubscriptionExtra = {
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  paidCents?: number;
  paymentSource?: "checkout" | "stripe_invoice" | "bank_transfer";
  stripePaymentId?: string;
  stripeFeeCents?: number | null;
  paymentMethod?: "STRIPE" | "BANK_TRANSFER";
  skipPaymentRecord?: boolean;
  /** Override period (e.g. bundled course → Mitgliedschaft for course year). */
  periodStart?: Date;
  periodEnd?: Date;
};

/** Interne Aktivierung – nicht als Server Action exportieren. */
export async function activateSubscription(
  subscriptionId: string,
  extra?: ActivateSubscriptionExtra,
) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!subscription) return null;

  // Abgebrochene Zeilen nicht durch späte Stripe-Events wiederbeleben.
  if (subscription.status === "CANCELLED") {
    if (extra?.stripeSubscriptionId) {
      const { cancelOrphanStripeSubscription } = await import(
        "@/lib/stripe-subscription-cancel"
      );
      await cancelOrphanStripeSubscription(extra.stripeSubscriptionId).catch(
        (error) => {
          console.error(
            "Stripe-Abo nach CANCELLED-Aktivierung",
            subscriptionId,
            error,
          );
        },
      );
    }
    return null;
  }

  const stillValid =
    subscription.status === "ACTIVE" &&
    isSubscriptionPeriodValid(subscription.periodEnd);

  if (stillValid) {
    const reconciled = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        ...(extra?.stripeSubscriptionId
          ? { stripeSubscriptionId: extra.stripeSubscriptionId }
          : {}),
        ...(extra?.stripeCustomerId
          ? { stripeCustomerId: extra.stripeCustomerId }
          : {}),
        ...(extra?.paidCents != null ? { paidCents: extra.paidCents } : {}),
        ...(extra?.paymentMethod ? { paymentMethod: extra.paymentMethod } : {}),
      },
      include: { plan: true },
    });
    const paidCents =
      extra?.paidCents ?? reconciled.paidCents ?? reconciled.plan.priceCents;
    const externalCents = externalPaymentDueCents(
      paidCents,
      reconciled.plan.priceCents,
      reconciled.creditAppliedCents,
      false,
    );
    if (
      !extra?.skipPaymentRecord &&
      extra?.stripePaymentId &&
      externalCents > 0
    ) {
      await recordSubscriptionPayment({
        subscriptionId: reconciled.id,
        amountCents: externalCents,
        source: extra.paymentSource ?? "checkout",
        stripePaymentId: extra.stripePaymentId,
        stripeFeeCents: extra.stripeFeeCents,
      });
    }
    const mail = await ensureMembershipCardEmail(
      reconciled.id,
      reconciled.plan.kind,
    );
    revalidateSubscriptionViews(subscription.planId);
    return { ...reconciled, membershipCardSent: mail.sent };
  }

  const computed = initialSubscriptionPeriod(subscription.plan.interval);
  const periodStart = extra?.periodStart ?? computed.periodStart;
  const periodEnd = extra?.periodEnd ?? computed.periodEnd;

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: "ACTIVE",
      paidAt: new Date(),
      periodStart,
      periodEnd,
      ...(extra?.stripeSubscriptionId
        ? { stripeSubscriptionId: extra.stripeSubscriptionId }
        : {}),
      ...(extra?.stripeCustomerId
        ? { stripeCustomerId: extra.stripeCustomerId }
        : {}),
      ...(extra?.paidCents != null ? { paidCents: extra.paidCents } : {}),
      ...(extra?.paymentMethod ? { paymentMethod: extra.paymentMethod } : {}),
    },
    include: { plan: true },
  });

  const paidCents =
    extra?.paidCents ?? updated.paidCents ?? updated.plan.priceCents;
  const externalCents = externalPaymentDueCents(
    paidCents,
    updated.plan.priceCents,
    updated.creditAppliedCents,
    false,
  );
  if (!extra?.skipPaymentRecord && externalCents > 0) {
    const source =
      extra?.paymentSource ??
      (updated.paymentMethod === "BANK_TRANSFER"
        ? "bank_transfer"
        : "checkout");
    await recordSubscriptionPayment({
      subscriptionId: updated.id,
      amountCents: externalCents,
      source,
      stripePaymentId: extra?.stripePaymentId,
      stripeFeeCents: extra?.stripeFeeCents,
    });
  }

  const mail = await ensureMembershipCardEmail(updated.id, updated.plan.kind);
  try {
    await sendSubscriptionConfirmation(updated.id);
  } catch (error) {
    console.error("Abo-Bestätigungsmail", updated.id, error);
  }
  revalidateSubscriptionViews(updated.planId);
  return { ...updated, membershipCardSent: mail.sent };
}
