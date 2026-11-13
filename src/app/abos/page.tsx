import type { Metadata } from "next";
import type { SubscriptionInterval } from "@/generated/prisma/client";
import { CourseCard } from "@/components/course-card";
import { MembershipBanner } from "@/components/membership-required";
import { SectionFilter } from "@/components/section-filter";
import { getCurrentUser } from "@/lib/auth";
import { expireStalePendingSubscriptions } from "@/lib/expire-pending";
import { listFamily } from "@/lib/family";
import { syncActiveStripeRecurringPeriods } from "@/lib/stripe-subscription-cancel";
import {
  assertClubMembership,
  getMembershipCheckoutPath,
} from "@/lib/membership";
import { shouldShowMembershipNotices } from "@/lib/membership-notices";
import { prisma } from "@/lib/prisma";
import { audienceMatchesAnyAge } from "@/lib/courses";
import { intervalMeta, publiclyVisiblePlanWhere, sortPlansForCatalog } from "@/lib/subscriptions";
import {
  isAllSectionsSelected,
  matchesSectionFilter,
  parseSelectedSectionIds,
} from "@/lib/section-filter";
import { sectionListOrderBy } from "@/lib/section-order";
import {
  catalogCardGridClass,
  catalogUsesCompactCards,
} from "@/lib/catalog-layout";
import { subscriptionCatalogBadgesForUser } from "@/lib/subscription-catalog";
import { planCardDisplay } from "@/lib/pricing";
import { getServerI18n } from "@/lib/i18n";
import type { TFunction } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

function intervalPerLabel(interval: SubscriptionInterval, t: TFunction): string {
  return intervalMeta(interval, t).per;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("subscriptions.title") };
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sektion?: string }>;
}) {
  const { t } = await getServerI18n();
  await expireStalePendingSubscriptions();

  const [{ sektion }, rawPlans, user, sections] = await Promise.all([
    searchParams,
    prisma.subscriptionPlan.findMany({
      where: publiclyVisiblePlanWhere(),
    }),
    getCurrentUser(),
    prisma.section.findMany({
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
  ]);
  let householdAges: number[] = [];
  if (user) {
    const family = await listFamily(user.id);
    householdAges = family.map((person) => person.age);
    await syncActiveStripeRecurringPeriods(family.map((person) => person.id));
  }
  const ageMatchedPlans = sortPlansForCatalog(rawPlans).filter((plan) =>
    audienceMatchesAnyAge(
      householdAges,
      plan.audienceMinAge,
      plan.audienceMaxAge,
    ),
  );
  const availableIds = sections.map((section) => section.id);
  const selectedIds = parseSelectedSectionIds(sektion, availableIds);
  const allSelected = isAllSectionsSelected(selectedIds, availableIds);
  const plans = ageMatchedPlans.filter((plan) =>
    matchesSectionFilter(plan.sectionId, selectedIds, availableIds),
  );
  const membership = user ? await assertClubMembership(user) : null;
  const birthDate = user
    ? (
        await prisma.user.findUnique({
          where: { id: user.id },
          select: { birthDate: true },
        })
      )?.birthDate ?? null
    : null;
  const membershipHref = membership && !membership.ok
    ? membership.href
    : await getMembershipCheckoutPath();
  const planBadges = user
    ? await subscriptionCatalogBadgesForUser(
        user.id,
        plans.map((plan) => ({
          id: plan.id,
          kind: plan.kind,
          interval: plan.interval,
        })),
        t,
      )
    : new Map();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl text-primary sm:text-5xl">{t("subscriptions.title")}</h1>
      {!(user && membership?.ok) && shouldShowMembershipNotices() ? (
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {t("subscriptions.hintFirst")}
        </p>
      ) : (
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {t("subscriptions.hintFamily")}
        </p>
      )}
      {shouldShowMembershipNotices() &&
      user &&
      membership &&
      !membership.ok ? (
        <div className="mt-6">
          <MembershipBanner href={membershipHref} />
        </div>
      ) : null}
      <SectionFilter sections={sections} selectedIds={selectedIds} />
      {plans.length === 0 ? (
        <p className="mt-10 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          {ageMatchedPlans.length === 0 || allSelected
            ? t("subscriptions.empty")
            : t("subscriptions.filterEmpty")}
        </p>
      ) : (
        <div className={cn("mt-10", catalogCardGridClass(plans.length))}>
          {plans.map((plan) => {
            const price = planCardDisplay(plan, birthDate);
            const intervalHint = intervalPerLabel(plan.interval, t);
            const entry = planBadges.get(plan.id);
            return (
            <CourseCard
              key={plan.id}
              id={plan.id}
              title={plan.title}
              description={plan.description}
              priceCents={price.priceCents}
              priceLabel={price.priceLabel}
              priceHint={intervalHint}
              accent={plan.accent}
              audienceMinAge={plan.audienceMinAge}
              audienceMaxAge={plan.audienceMaxAge}
              href={`/abos/${plan.id}`}
              compact={catalogUsesCompactCards(plans.length)}
              cornerBadge={entry?.badge.label}
              cornerBadgeTone={entry?.badge.tone}
              statusHint={entry?.validityHint}
            />
            );
          })}
        </div>
      )}
    </div>
  );
}
