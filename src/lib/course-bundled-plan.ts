import type { PlanKind, SubscriptionInterval } from "@/generated/prisma/client";
import {
  sendMembershipCardsForSubscriptions,
  type MembershipCardTarget,
} from "@/lib/membership-card";
import { prisma } from "@/lib/prisma";
import { revalidateSubscriptionViews } from "@/lib/revalidate-subscriptions";
import {
  currentlyValidSubscriptionFilter,
  nextCalendarYearPeriod,
} from "@/lib/subscriptions";

export const INVALID_BUNDLED_MEMBERSHIP_ERROR =
  "Die Folgemitgliedschaft muss eine Vereinsmitgliedschaft mit dem Intervall „jährlich (Kalenderjahr)“ sein.";

export function bundledMembershipPlanError(plan: {
  kind: PlanKind;
  interval: SubscriptionInterval;
}) {
  if (plan.kind !== "MEMBERSHIP" || plan.interval !== "YEARLY_CALENDAR") {
    return INVALID_BUNDLED_MEMBERSHIP_ERROR;
  }
  return null;
}

export async function validateBundledMembershipPlan(planId: string | null) {
  if (!planId) return null;
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { kind: true, interval: true },
  });
  if (!plan) return "Die gewählte Folgemitgliedschaft wurde nicht gefunden.";
  return bundledMembershipPlanError(plan);
}

/**
 * After a course enrollment is PAID: if the course has a bundled plan,
 * schedule that calendar-year membership for the enrolled member.
 *
 * Already valid/scheduled membership: keep its period, bank +1 prepaid renewal
 * (consumed free at period end instead of auto-renew charge).
 */
export async function grantBundledPlansForPaidEnrollments(
  enrollmentIds: string[],
) {
  if (enrollmentIds.length === 0) return;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      id: { in: enrollmentIds },
      status: "PAID",
    },
    select: {
      id: true,
      userId: true,
      purchasedById: true,
      bundledPlanGrantedAt: true,
      course: {
        select: {
          bundledPlanId: true,
        },
      },
    },
  });

  const cards: MembershipCardTarget[] = [];

  for (const enrollment of enrollments) {
    const planId = enrollment.course.bundledPlanId;
    if (!planId) continue;

    if (!enrollment.bundledPlanGrantedAt) {
      const claimed = await prisma.enrollment.updateMany({
        where: { id: enrollment.id, bundledPlanGrantedAt: null },
        data: { bundledPlanGrantedAt: new Date() },
      });
      if (claimed.count === 0) {
        const latest = await prisma.enrollment.findUnique({
          where: { id: enrollment.id },
          select: { bundledPlanGrantedAt: true },
        });
        const fallback = await bundledMembershipCardTarget(
          enrollment.userId,
          planId,
          latest?.bundledPlanGrantedAt ?? null,
        );
        if (fallback) cards.push(fallback);
        continue;
      }

      try {
        const granted = await grantBundledPlanToMember({
          userId: enrollment.userId,
          planId,
          purchasedById: enrollment.purchasedById,
        });
        if (granted) cards.push(granted);
      } catch (error) {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { bundledPlanGrantedAt: null },
        });
        console.error(
          "Folgemitgliedschaft nach Kurszahlung",
          enrollment.id,
          planId,
          error,
        );
      }
      continue;
    }

    const fallback = await bundledMembershipCardTarget(
      enrollment.userId,
      planId,
      enrollment.bundledPlanGrantedAt,
    );
    if (fallback) cards.push(fallback);
  }

  try {
    await sendMembershipCardsForSubscriptions(cards);
  } catch (error) {
    console.error("Mitgliedskarten für Folgemitgliedschaften", error);
  }
}

async function bundledMembershipCardTarget(
  userId: string,
  planId: string,
  grantedAt: Date | null,
): Promise<MembershipCardTarget | null> {
  const now = new Date();
  const [scheduled, active] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        userId,
        planId,
        status: "SCHEDULED",
        periodEnd: { gte: now },
      },
      orderBy: { periodEnd: "desc" },
    }),
    prisma.subscription.findFirst({
      where: {
        userId,
        planId,
        ...currentlyValidSubscriptionFilter(now),
      },
      orderBy: { periodEnd: "desc" },
    }),
  ]);

  if (scheduled) {
    if (
      scheduled.membershipCardSentAt &&
      grantedAt &&
      scheduled.membershipCardSentAt >= grantedAt
    ) {
      return null;
    }
    return {
      subscriptionId: scheduled.id,
      periodStart: scheduled.periodStart,
      periodEnd: scheduled.periodEnd,
      force: Boolean(scheduled.membershipCardSentAt),
    };
  }

  if (active && active.prepaidRenewalCredits > 0) {
    if (
      active.membershipCardSentAt &&
      grantedAt &&
      active.membershipCardSentAt >= grantedAt
    ) {
      return null;
    }
    let cardPeriod = nextCalendarYearPeriod(active.periodEnd ?? now);
    for (let index = 1; index < active.prepaidRenewalCredits; index += 1) {
      cardPeriod = nextCalendarYearPeriod(cardPeriod.periodEnd);
    }
    return {
      subscriptionId: active.id,
      periodStart: cardPeriod.periodStart,
      periodEnd: cardPeriod.periodEnd,
      force: true,
    };
  }

  return null;
}

async function grantBundledPlanToMember(input: {
  userId: string;
  planId: string;
  purchasedById: string | null;
}): Promise<MembershipCardTarget | null> {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: input.planId },
  });
  if (!plan) {
    throw new Error("Die gewählte Folgemitgliedschaft wurde nicht gefunden.");
  }
  const configurationError = bundledMembershipPlanError(plan);
  if (configurationError) throw new Error(configurationError);

  const now = new Date();
  const [scheduled, active] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        userId: input.userId,
        planId: input.planId,
        status: "SCHEDULED",
        periodEnd: { gte: now },
      },
      orderBy: { periodEnd: "desc" },
    }),
    prisma.subscription.findFirst({
      where: {
        userId: input.userId,
        planId: input.planId,
        ...currentlyValidSubscriptionFilter(now),
      },
      orderBy: { periodEnd: "desc" },
    }),
  ]);
  const existing = scheduled ?? active;

  if (existing) {
    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        prepaidRenewalCredits: { increment: 1 },
        ...(input.purchasedById
          ? { purchasedById: input.purchasedById }
          : {}),
      },
    });

    // Bei einer laufenden Stripe-Mitgliedschaft gehört die nächste Periode
    // dem Kursguthaben und darf nicht zusätzlich belastet werden.
    if (
      existing.status === "ACTIVE" &&
      (existing.stripeSubscriptionId || existing.stripeSessionId)
    ) {
      try {
        const { deferStripeRecurringForPrepaidRenewal } = await import(
          "@/lib/stripe-subscription-cancel"
        );
        await deferStripeRecurringForPrepaidRenewal(existing);
      } catch (error) {
        console.error(
          "Stripe Folgemitgliedschaft Prepaid",
          existing.id,
          error,
        );
      }
    }

    if (existing.status === "SCHEDULED") {
      revalidateSubscriptionViews(input.planId);
      if (updated.prepaidRenewalCredits <= 0) {
        return {
          subscriptionId: existing.id,
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          force: true,
        };
      }
      let cardPeriod = {
        periodStart: existing.periodStart ?? nextCalendarYearPeriod(now).periodStart,
        periodEnd: existing.periodEnd ?? nextCalendarYearPeriod(now).periodEnd,
      };
      for (let index = 0; index < updated.prepaidRenewalCredits; index += 1) {
        cardPeriod = nextCalendarYearPeriod(cardPeriod.periodEnd);
      }
      return {
        subscriptionId: existing.id,
        periodStart: cardPeriod.periodStart,
        periodEnd: cardPeriod.periodEnd,
        force: true,
      };
    }

    let cardPeriod = nextCalendarYearPeriod(existing.periodEnd ?? now);
    for (let index = 1; index < updated.prepaidRenewalCredits; index += 1) {
      cardPeriod = nextCalendarYearPeriod(cardPeriod.periodEnd);
    }
    revalidateSubscriptionViews(input.planId);
    return {
      subscriptionId: existing.id,
      periodStart: cardPeriod.periodStart,
      periodEnd: cardPeriod.periodEnd,
      force: true,
    };
  }

  const { periodStart, periodEnd } = nextCalendarYearPeriod(now);
  const created = await prisma.subscription.create({
    data: {
      userId: input.userId,
      planId: input.planId,
      status: "SCHEDULED",
      autoRenew: false,
      paidCents: 0,
      purchasedById: input.purchasedById,
      periodStart,
      periodEnd,
    },
  });

  revalidateSubscriptionViews(input.planId);
  return {
    subscriptionId: created.id,
    periodStart,
    periodEnd,
    force: true,
  };
}
