import type { SessionUser } from "@/lib/auth";
import { shouldShowMembershipNotices } from "@/lib/membership-notices";
import { prisma } from "@/lib/prisma";
import { isUserProfileComplete } from "@/lib/profile-gate";
import {
  CLUB_MEMBERSHIP_PLAN_ID,
  currentlyValidSubscriptionFilter,
  isPlanPubliclyVisible,
  publiclyVisiblePlanWhere,
} from "@/lib/subscriptions";

export {
  MEMBERSHIP_NOTICES_FROM_MS,
  shouldShowMembershipNotices,
} from "@/lib/membership-notices";

export async function getPublishedMembershipPlan() {
  const preferred = await prisma.subscriptionPlan.findUnique({
    where: { id: CLUB_MEMBERSHIP_PLAN_ID },
  });
  if (preferred && isPlanPubliclyVisible(preferred)) return preferred;

  return prisma.subscriptionPlan.findFirst({
    where: {
      kind: "MEMBERSHIP",
      ...publiclyVisiblePlanWhere(),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getMembershipCheckoutPath() {
  const plan = await getPublishedMembershipPlan();
  return plan ? `/abos/${plan.id}` : "/abos";
}

export async function hasActiveClubMembership(userId: string) {
  const { processDueAutoRenewals } = await import("@/lib/subscription-renewal");
  await processDueAutoRenewals();
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      plan: { kind: "MEMBERSHIP" },
      ...currentlyValidSubscriptionFilter(now),
    },
    select: { id: true },
  });
  return Boolean(subscription);
}

export async function hasActiveTennisSeasonCard(userId: string) {
  const { processDueAutoRenewals } = await import("@/lib/subscription-renewal");
  await processDueAutoRenewals();
  return hasActiveTennisSeasonCardNow(userId);
}

/** Ohne Renewal-Nebenwirkung – z. B. für Start-Weiterleitung im Layout. */
export async function hasActiveTennisSeasonCardNow(userId: string) {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      plan: {
        kind: "ADDON",
        section: { name: "Tennis" },
      },
      ...currentlyValidSubscriptionFilter(now),
    },
    select: { id: true },
  });
  return Boolean(subscription);
}

export async function courtBookingIsFree(userId: string) {
  return hasActiveTennisSeasonCard(userId);
}

/** Startziel für angemeldete Nutzer: zuerst Stammdaten, sonst Tennis/Kurse. */
export async function getLoggedInHomePath(userId: string) {
  if (!(await isUserProfileComplete(userId))) return "/konto/familie";
  if (await hasActiveTennisSeasonCardNow(userId)) return "/tennisplatz";
  return "/kurse";
}

export async function assertClubMembership(user: SessionUser) {
  if (!shouldShowMembershipNotices()) return { ok: true as const };
  if (user.role === "ADMIN") return { ok: true as const };
  if (await hasActiveClubMembership(user.id)) return { ok: true as const };

  const href = await getMembershipCheckoutPath();
  return {
    ok: false as const,
    href,
    error:
      "Bitte zuerst die Vereinsmitgliedschaft abschließen. Ohne gültigen Mitgliedsbeitrag können Sie keine Kurse buchen und keine Tennis-Saisonkarte kaufen.",
  };
}
