import { resolvePlanPrice } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { sendMembershipCardForSubscription } from "@/lib/membership-card";
import { recordSubscriptionPayment } from "@/lib/subscription-payments";
import {
  estimateStripeFeeCents,
  fetchStripeFeeFromPaymentIntent,
} from "@/lib/stripe-fees";
import { chargeSubscriptionRenewal } from "@/lib/stripe-renewal-charge";
import {
  isSectionStripeConfigured,
  listAllStripeSecretKeys,
} from "@/lib/section-payments";
import { withStripeAccounts } from "@/lib/stripe";
import { getLocale } from "@/lib/i18n/locale";
import { getTranslator } from "@/lib/i18n/translator";
import {
  intervalMeta,
  nextCalendarYearPeriod,
  renewSubscriptionPeriod,
} from "@/lib/subscriptions";
import {
  stopEndedStripeRecurring,
  syncActiveStripeRecurringPeriods,
} from "@/lib/stripe-subscription-cancel";

async function sendScheduledMembershipDocuments() {
  const [scheduled, prepaid] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        status: "SCHEDULED",
        membershipCardSentAt: null,
        plan: {
          kind: "MEMBERSHIP",
          interval: "YEARLY_CALENDAR",
        },
      },
      select: { id: true },
    }),
    prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        prepaidRenewalCredits: { gt: 0 },
        plan: {
          kind: "MEMBERSHIP",
          interval: "YEARLY_CALENDAR",
        },
      },
      select: {
        id: true,
        userId: true,
        planId: true,
        periodEnd: true,
        prepaidRenewalCredits: true,
        membershipCardSentAt: true,
      },
    }),
  ]);
  const bundledGrants =
    prepaid.length > 0
      ? await prisma.enrollment.findMany({
          where: {
            userId: { in: [...new Set(prepaid.map((item) => item.userId))] },
            bundledPlanGrantedAt: { not: null },
            course: {
              bundledPlanId: {
                in: [...new Set(prepaid.map((item) => item.planId))],
              },
            },
          },
          select: {
            userId: true,
            bundledPlanGrantedAt: true,
            course: { select: { bundledPlanId: true } },
          },
        })
      : [];
  const latestGrantByMembership = new Map<string, Date>();
  for (const grant of bundledGrants) {
    if (!grant.bundledPlanGrantedAt || !grant.course.bundledPlanId) continue;
    const key = `${grant.userId}:${grant.course.bundledPlanId}`;
    const previous = latestGrantByMembership.get(key);
    if (!previous || grant.bundledPlanGrantedAt > previous) {
      latestGrantByMembership.set(key, grant.bundledPlanGrantedAt);
    }
  }

  for (const item of scheduled) {
    await sendMembershipCardForSubscription(item.id).catch((error) => {
      console.error("Mitgliedskarte für Folgemitgliedschaft", item.id, error);
    });
  }

  for (const item of prepaid) {
    const latestGrant = latestGrantByMembership.get(
      `${item.userId}:${item.planId}`,
    );
    if (!latestGrant) continue;
    if (
      item.membershipCardSentAt &&
      item.membershipCardSentAt >= latestGrant
    ) {
      continue;
    }
    let cardPeriod = nextCalendarYearPeriod(item.periodEnd ?? new Date());
    for (
      let index = 1;
      index < item.prepaidRenewalCredits;
      index += 1
    ) {
      cardPeriod = nextCalendarYearPeriod(cardPeriod.periodEnd);
    }
    await sendMembershipCardForSubscription(item.id, {
      force: true,
      periodStart: cardPeriod.periodStart,
      periodEnd: cardPeriod.periodEnd,
    }).catch((error) => {
      console.error(
        "Mitgliedskarte für vorausbezahlte Folgemitgliedschaft",
        item.id,
        error,
      );
    });
  }
}

async function activateScheduledMemberships(now: Date) {
  const scheduled = await prisma.subscription.findMany({
    where: {
      status: "SCHEDULED",
      periodStart: { lte: now },
      plan: {
        kind: "MEMBERSHIP",
        interval: "YEARLY_CALENDAR",
      },
    },
    select: { id: true },
  });

  let activated = 0;
  let failed = 0;
  for (const item of scheduled) {
    try {
      const claimed = await prisma.subscription.updateMany({
        where: { id: item.id, status: "SCHEDULED" },
        data: { status: "ACTIVE", paidAt: now },
      });
      if (claimed.count === 0) continue;
      activated += 1;

      await recordSubscriptionPayment({
        subscriptionId: item.id,
        amountCents: 0,
        source: "course_bundle",
        paidAt: now,
      }).catch((error) => {
        console.error("Vorgemerkte Mitgliedschaft verbuchen", item.id, error);
      });
    } catch (error) {
      console.error("Vorgemerkte Mitgliedschaft aktivieren", item.id, error);
      failed += 1;
    }
  }
  return { activated, failed };
}

async function resolveStripeCustomerId(subscription: {
  id: string;
  stripeCustomerId: string | null;
  stripeSessionId: string | null;
}) {
  if (subscription.stripeCustomerId) return subscription.stripeCustomerId;
  if (
    !subscription.stripeSessionId ||
    (await listAllStripeSecretKeys()).length === 0
  ) {
    return null;
  }

  try {
    const customerId = await withStripeAccounts(async (stripe) => {
      const session = await stripe.checkout.sessions.retrieve(
        subscription.stripeSessionId!,
      );
      return typeof session.customer === "string" ? session.customer : null;
    });
    if (customerId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripeCustomerId: customerId },
      });
    }
    return customerId;
  } catch (error) {
    console.error("Stripe-Kunde laden", subscription.id, error);
    return null;
  }
}

async function renewalAmountCents(subscription: {
  userId: string;
  plan: {
    priceCents: number;
    childPriceCents: number | null;
    childMaxAge: number;
    pricingMode: import("@/generated/prisma/client").PlanPricingMode;
    familyPriceCents: number | null;
    familyAdults: number | null;
    familyChildren: number | null;
  };
}) {
  const user = await prisma.user.findUnique({
    where: { id: subscription.userId },
    select: { birthDate: true },
  });
  return resolvePlanPrice(subscription.plan, user?.birthDate ?? null).cents;
}

async function renewOnePeriod(
  subscription: {
    id: string;
    userId: string;
    periodEnd: Date | null;
    prepaidRenewalCredits: number;
    stripeCustomerId: string | null;
    stripeSessionId: string | null;
    plan: {
      title: string;
      priceCents: number;
      childPriceCents: number | null;
      childMaxAge: number;
      pricingMode: import("@/generated/prisma/client").PlanPricingMode;
      familyPriceCents: number | null;
      familyAdults: number | null;
      familyChildren: number | null;
      interval: import("@/generated/prisma/client").SubscriptionInterval;
      kind: import("@/generated/prisma/client").PlanKind;
      sectionId: string | null;
    };
  },
  now: Date,
  options: {
    stripeLive: boolean;
    charge: boolean;
    usePrepaidCredit: boolean;
  },
) {
  const amount = options.usePrepaidCredit
    ? 0
    : await renewalAmountCents(subscription);
  let stripePaymentId: string | undefined;

  if (options.charge && amount > 0) {
    if (options.stripeLive) {
      const stripeCustomerId = await resolveStripeCustomerId(subscription);
      if (!stripeCustomerId) {
        return { ok: false as const, reason: "no_customer" };
      }
      const charged = await chargeSubscriptionRenewal(
        stripeCustomerId,
        amount,
        `Verlängerung: ${subscription.plan.title}`,
        subscription.plan.sectionId,
      );
      if (!charged.ok) {
        return { ok: false as const, reason: charged.reason };
      }
      stripePaymentId = charged.paymentIntentId;
    }
  }

  const { periodStart, periodEnd } = renewSubscriptionPeriod(
    subscription.plan.interval,
    subscription.periodEnd,
    now,
  );

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      periodStart,
      periodEnd,
      paidAt: now,
      ...(amount > 0 ? { paidCents: amount } : {}),
      ...(options.usePrepaidCredit
        ? { prepaidRenewalCredits: { decrement: 1 } }
        : {}),
    },
  });

  if (options.usePrepaidCredit) {
    await recordSubscriptionPayment({
      subscriptionId: subscription.id,
      amountCents: 0,
      source: "course_bundle",
      paidAt: now,
    });
  } else if (amount > 0) {
    const stripeFeeCents =
      stripePaymentId != null
        ? (await fetchStripeFeeFromPaymentIntent(stripePaymentId)) ??
          estimateStripeFeeCents(amount)
        : estimateStripeFeeCents(amount);
    await recordSubscriptionPayment({
      subscriptionId: subscription.id,
      amountCents: amount,
      source: "renewal",
      paidAt: now,
      stripePaymentId,
      stripeFeeCents,
    });
  }

  if (subscription.plan.kind === "MEMBERSHIP") {
    try {
      const result = await sendMembershipCardForSubscription(subscription.id, {
        force: true,
      });
      if (!result.sent) {
        console.error(
          "Mitgliedskarte nach Verlängerung",
          subscription.id,
          result.message,
        );
      }
    } catch (error) {
      console.error("Mitgliedskarte nach Verlängerung", subscription.id, error);
    }
  }

  return {
    ok: true as const,
    periodEnd,
    prepaidRenewalCredits: updated.prepaidRenewalCredits,
  };
}

/**
 * Extends ACTIVE subscriptions whose period ended while autoRenew is on,
 * or while prepaid course-bundle renewals remain.
 * Stripe-recurring plans are left to invoice.paid unless a prepaid credit applies.
 */
export async function processDueAutoRenewals(now = new Date()) {
  const locale = await getLocale();
  const t = getTranslator(locale);
  await sendScheduledMembershipDocuments();
  const scheduled = await activateScheduledMemberships(now);
  await stopEndedStripeRecurring(now);
  await syncActiveStripeRecurringPeriods();
  const due = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      periodEnd: { lte: now },
      OR: [{ autoRenew: true }, { prepaidRenewalCredits: { gt: 0 } }],
    },
    include: { plan: true },
  });

  let renewed = 0;
  let failed = 0;
  const anyStripe = (await listAllStripeSecretKeys()).length > 0;

  for (const subscription of due) {
    const meta = intervalMeta(subscription.plan.interval, t);
    let prepaidLeft = subscription.prepaidRenewalCredits;

    // Recurring Stripe billing owns the next period unless a course prepaid credit is due.
    if (
      subscription.stripeSubscriptionId &&
      meta.stripe &&
      prepaidLeft <= 0
    ) {
      continue;
    }

    const amount = await renewalAmountCents(subscription);
    const isFree = amount === 0;
    const stripeLive = await isSectionStripeConfigured(
      subscription.plan.sectionId,
    );

    let cursorEnd = subscription.periodEnd ?? now;
    let current = subscription;

    while (cursorEnd <= now) {
      const usePrepaidCredit = prepaidLeft > 0;
      if (!usePrepaidCredit && !subscription.autoRenew) {
        break;
      }

      const needsStripeCharge =
        !usePrepaidCredit && stripeLive && !meta.stripe && !isFree;
      const allowLocal =
        usePrepaidCredit || isFree || !stripeLive || needsStripeCharge;

      if (!allowLocal) {
        break;
      }

      const result = await renewOnePeriod(current, now, {
        stripeLive: stripeLive || anyStripe,
        charge: needsStripeCharge,
        usePrepaidCredit,
      });

      if (!result.ok) {
        console.error(
          "Auto-Verlängerung fehlgeschlagen",
          subscription.id,
          result.reason,
        );
        failed += 1;
        break;
      }

      renewed += 1;
      cursorEnd = result.periodEnd;
      prepaidLeft = result.prepaidRenewalCredits;
      current = {
        ...current,
        periodEnd: result.periodEnd,
        prepaidRenewalCredits: result.prepaidRenewalCredits,
      };
    }
  }

  return {
    renewed,
    failed: failed + scheduled.failed,
    checked: due.length + scheduled.activated + scheduled.failed,
    scheduledActivated: scheduled.activated,
  };
}
