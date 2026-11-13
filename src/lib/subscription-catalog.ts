import type { SubscriptionInterval } from "@/generated/prisma/client";
import {
  type CatalogBadge,
  familyAlreadyEnrolledBadge,
  paymentPendingCatalogBadge,
  preferCatalogBadge,
} from "@/lib/catalog-badges";
import { listFamily } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import type { TFunction } from "@/lib/i18n/types";
import {
  currentlyValidSubscriptionFilter,
  isPendingBankTransfer,
  subscriptionValidityLabels,
} from "@/lib/subscriptions";

export type SubscriptionCatalogEntry = {
  badge: CatalogBadge;
  validityHint?: string;
};

/** Plan IDs the user currently holds with a valid subscription. */
export async function ownedPlanIdsForUser(
  userId: string,
  planIds: string[],
  now = new Date(),
) {
  if (planIds.length === 0) return new Set<string>();
  const rows = await prisma.subscription.findMany({
    where: {
      userId,
      planId: { in: planIds },
      ...currentlyValidSubscriptionFilter(now),
    },
    select: { planId: true },
  });
  return new Set(rows.map((row) => row.planId));
}

/** Katalog-Badge pro Abo (Nutzer oder Familienmitglied). */
export async function subscriptionCatalogBadgesForUser(
  userId: string,
  plans: { id: string; kind: string; interval: SubscriptionInterval }[],
  t: TFunction,
  now = new Date(),
): Promise<Map<string, SubscriptionCatalogEntry>> {
  const planIds = plans.map((plan) => plan.id);
  if (planIds.length === 0) return new Map();

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const family = await listFamily(userId);
  const memberIds = family.map((person) => person.id);
  const familySize = memberIds.length;

  const rows = await prisma.subscription.findMany({
    where: {
      userId: { in: memberIds },
      planId: { in: planIds },
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: {
      userId: true,
      planId: true,
      status: true,
      paymentMethod: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
    },
  });

  const activeByPlan = new Map<string, Set<string>>();
  const pendingByPlan = new Map<string, CatalogBadge>();
  const nameById = new Map(family.map((person) => [person.id, person.name]));
  const validityCandidates = new Map<
    string,
    { userId: string; hint: string; periodEnd: Date | null }
  >();

  for (const row of rows) {
    const plan = planById.get(row.planId);
    if (!plan) continue;

    if (row.status === "ACTIVE" && (!row.periodEnd || row.periodEnd >= now)) {
      const set = activeByPlan.get(row.planId) ?? new Set<string>();
      set.add(row.userId);
      activeByPlan.set(row.planId, set);

      const hint = subscriptionValidityLabels(
        plan.interval,
        row.periodStart,
        row.periodEnd,
        row.paidAt,
        t,
      ).until;
      const current = validityCandidates.get(row.planId);
      const next = { userId: row.userId, hint, periodEnd: row.periodEnd };
      validityCandidates.set(
        row.planId,
        pickValidityCandidate(current, next, userId),
      );
      continue;
    }

    if (isPendingBankTransfer(row)) {
      const badge = paymentPendingCatalogBadge(row.paymentMethod, t);
      if (badge) {
        pendingByPlan.set(
          row.planId,
          preferCatalogBadge(pendingByPlan.get(row.planId), badge),
        );
      }
    }
  }

  const entries = new Map<string, SubscriptionCatalogEntry>();
  for (const plan of plans) {
    const active = activeByPlan.get(plan.id);
    const enrolledNames = memberIds
      .filter((id) => active?.has(id))
      .map((id) => nameById.get(id) ?? "")
      .filter(Boolean);
    const enrolledBadge = familyAlreadyEnrolledBadge(
      enrolledNames,
      familySize,
      t,
    );
    const pending = pendingByPlan.get(plan.id);
    let badge: CatalogBadge | null = null;
    if (enrolledBadge && pending) {
      badge = preferCatalogBadge(pending, enrolledBadge);
    } else if (enrolledBadge) {
      badge = enrolledBadge;
    } else if (pending) {
      badge = pending;
    }
    if (badge) {
      entries.set(plan.id, { badge });
    }
  }

  for (const [planId, candidate] of validityCandidates) {
    const entry = entries.get(planId);
    if (entry?.badge.tone === "success") {
      entries.set(planId, { ...entry, validityHint: candidate.hint });
    }
  }

  return entries;
}

function pickValidityCandidate(
  current:
    | { userId: string; hint: string; periodEnd: Date | null }
    | undefined,
  next: { userId: string; hint: string; periodEnd: Date | null },
  preferredUserId: string,
) {
  if (!current) return next;
  if (next.userId === preferredUserId && current.userId !== preferredUserId) {
    return next;
  }
  if (current.userId === preferredUserId && next.userId !== preferredUserId) {
    return current;
  }
  if (!next.periodEnd) return next;
  if (!current.periodEnd) return current;
  return next.periodEnd < current.periodEnd ? next : current;
}
