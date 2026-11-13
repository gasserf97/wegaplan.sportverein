import type { Metadata } from "next";
import type { SubscriptionInterval } from "@/generated/prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MembershipRequired } from "@/components/membership-required";
import { ActivePlanSubscriptions } from "@/components/active-plan-subscriptions";
import { FamilyPurchase } from "@/components/family-purchase";
import { getAccent, resolveAccent } from "@/lib/accents";
import { getCurrentUser } from "@/lib/auth";
import { listFamily } from "@/lib/family";
import { formatEuro } from "@/lib/format";
import {
  getMembershipCheckoutPath,
  hasActiveClubMembership,
  shouldShowMembershipNotices,
} from "@/lib/membership";
import { expireStalePendingSubscriptions } from "@/lib/expire-pending";
import {
  familyBundleComposition,
  familyBundleLabel,
  isFamilyBundlePlan,
  resolvePlanPrice,
} from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { currentlyValidSubscriptionFilter, intervalMeta, isPlanPubliclyVisible } from "@/lib/subscriptions";
import { processDueAutoRenewals } from "@/lib/subscription-renewal";
import { isSectionBankConfigured, isSectionStripeConfigured } from "@/lib/section-payments";
import { getCreditBalance } from "@/lib/credit";
import { SubscriptionCheckoutCleanup } from "@/components/court-checkout-cleanup";
import { audienceMismatchReason, formatCourseAudience } from "@/lib/courses";
import { getServerI18n } from "@/lib/i18n";
import type { TFunction } from "@/lib/i18n/types";

function intervalPerLabel(interval: SubscriptionInterval, t: TFunction): string {
  return intervalMeta(interval, t).per;
}

function intervalLabel(interval: SubscriptionInterval, t: TFunction): string {
  return intervalMeta(interval, t).label;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { t } = await getServerI18n();
  const { id } = await params;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  return { title: plan?.title ?? t("subscriptions.metadataFallback") };
}

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const { id } = await params;
  await processDueAutoRenewals();
  await expireStalePendingSubscriptions();
  const [plan, user] = await Promise.all([
    prisma.subscriptionPlan.findUnique({ where: { id } }),
    getCurrentUser(),
  ]);

  if (!plan) {
    notFound();
  }
  if (!isPlanPubliclyVisible(plan) && user?.role !== "ADMIN") {
    notFound();
  }

  const visual = getAccent(resolveAccent(plan.accent));
  const audienceLabel = formatCourseAudience(
    plan.audienceMinAge,
    plan.audienceMaxAge,
    t,
  );
  const perLabel = intervalPerLabel(plan.interval, t);
  const renewLabel = intervalLabel(plan.interval, t);
  const family = user ? await listFamily(user.id) : [];
  const isFamilyBundle = isFamilyBundlePlan(plan);
  const bundleComposition = isFamilyBundle ? familyBundleComposition(plan) : null;
  const now = new Date();
  const planPurchaseOpen = isPlanPubliclyVisible(plan);
  const validFilter = currentlyValidSubscriptionFilter(now);
  const buyers = await Promise.all(
    family.map(async (person) => {
      const quote = resolvePlanPrice(plan, person.birthDate);
      const existing = await prisma.subscription.findFirst({
        where: { userId: person.id, planId: plan.id, ...validFilter },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          autoRenew: true,
          paidCents: true,
        },
      });
      const expired = await prisma.subscription.findFirst({
        where: {
          userId: person.id,
          planId: plan.id,
          status: "ACTIVE",
          periodEnd: { lt: now },
        },
        select: { id: true, periodEnd: true },
      });
      return {
        id: person.id,
        name: person.name,
        isSelf: person.isSelf,
        age: person.age,
        priceCents: quote.cents,
        bandLabel: "",
        hasMembership: user?.role === "ADMIN" ? true : person.hasMembership,
        alreadyHas: Boolean(existing),
        ineligibleReason:
          audienceMismatchReason(
            person.age,
            plan.audienceMinAge,
            plan.audienceMaxAge,
            t,
          ) ?? undefined,
        activeSubscription: existing,
        expired: Boolean(expired) && !existing,
      };
    }),
  );
  const requireMembership =
    shouldShowMembershipNotices() && plan.kind !== "MEMBERSHIP";
  const canBuyAnyone = buyers.some(
    (person) =>
      !person.alreadyHas &&
      !person.ineligibleReason &&
      (!requireMembership || person.hasMembership),
  );
  const allOwnIt = buyers.length > 0 && buyers.every((person) => person.alreadyHas);
  const anyExpired = buyers.some((person) => person.expired);
  const activeSubscriptions = buyers
    .filter((person) => person.activeSubscription)
    .map((person) => ({
      subscriptionId: person.activeSubscription!.id,
      memberName: person.name,
      showMemberName: family.length > 1,
      periodStart: person.activeSubscription!.periodStart,
      periodEnd: person.activeSubscription!.periodEnd,
      paidAt: person.activeSubscription!.paidAt,
      autoRenew: person.activeSubscription!.autoRenew,
      paidCents: person.activeSubscription!.paidCents ?? person.priceCents,
      priceCents: person.priceCents,
      autoRenewOffered: plan.autoRenewOffered,
    }));
  const birthDate = family.find((person) => person.isSelf)?.birthDate ?? null;
  const quote = resolvePlanPrice(plan, birthDate);
  const displayCents = user ? quote.cents : plan.priceCents;
  const membershipHref = await getMembershipCheckoutPath();
  const selfHasMembership =
    user?.role === "ADMIN" ||
    (user ? await hasActiveClubMembership(user.id) : false);
  const creditBalanceCents = user ? await getCreditBalance(user.id) : 0;

  const membershipNoticesOn = shouldShowMembershipNotices();
  const membershipHint =
    user && (selfHasMembership || !membershipNoticesOn)
      ? plan.kind === "MEMBERSHIP"
        ? t("subscriptions.membershipHintMembershipSelf")
        : t("subscriptions.membershipHintMembershipFamily")
      : plan.kind === "MEMBERSHIP"
        ? t("subscriptions.membershipHintGuestMembership")
        : t("subscriptions.membershipHintGuestAddon");

  const submitLabel = anyExpired
    ? buyers.every((person) => person.priceCents === 0) &&
      !(isFamilyBundle && (plan.familyPriceCents ?? 0) > 0)
      ? t("subscriptions.renewMembership")
      : t("subscriptions.renewNow")
    : buyers.every((person) => person.priceCents === 0) &&
        !(isFamilyBundle && (plan.familyPriceCents ?? 0) > 0)
      ? t("subscriptions.activateFree")
      : t("subscriptions.completeNow");

  return (
    <>
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div>
        <h1
          className={`border-l-4 pl-4 text-4xl sm:text-5xl ${visual.borderClass}`}
        >
          {plan.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          {plan.description}
        </p>
        {audienceLabel ? (
          <p className="mt-3 text-sm font-medium">{audienceLabel}</p>
        ) : null}
      </div>

      <aside className="h-fit rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <p className="font-heading text-4xl">
          {displayCents === 0
            ? t("subscriptions.free")
            : formatEuro(displayCents, locale)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{perLabel}</p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {membershipHint}
        </p>
        <p className="mt-2 text-xs">
          <Link href="/konto/familie" className="underline">
            {t("common.familyManage")}
          </Link>
        </p>
        <div className="mt-6">
          {activeSubscriptions.length > 0 ? (
            <div className="mb-4 grid gap-3">
              <p className="text-sm font-medium">{t("subscriptions.activeAbo")}</p>
              <ActivePlanSubscriptions
                items={activeSubscriptions}
                interval={plan.interval}
                planKind={plan.kind}
              />
              {allOwnIt ? (
                <p className="text-xs text-muted-foreground">
                  {t("subscriptions.accountDetails")}
                </p>
              ) : null}
            </div>
          ) : null}
          {user && allOwnIt && activeSubscriptions.length === 0 ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
              {t("subscriptions.allHaveAbo")}
            </p>
          ) : user && allOwnIt ? null : !planPurchaseOpen ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
              Diese Mitgliedschaft ist derzeit nicht zur Anmeldung freigeschaltet.
            </p>
          ) : user && requireMembership && !canBuyAnyone && !selfHasMembership ? (
            <MembershipRequired
              href={membershipHref}
              nextLabel={t("subscriptions.buyThisForFamily")}
            />
          ) : user ? (
            <>
              {anyExpired && plan.kind === "MEMBERSHIP" ? (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {t("subscriptions.expiredWarning")}
                </p>
              ) : null}
              <FamilyPurchase
              kind="plan"
              itemId={plan.id}
              people={buyers}
              requireMembership={requireMembership}
              autoRenewOffered={plan.autoRenewOffered}
              intervalLabel={renewLabel}
              stripeAvailable={await isSectionStripeConfigured(plan.sectionId)}
              bankTransferAvailable={
                plan.allowBankTransfer &&
                (await isSectionBankConfigured(plan.sectionId))
              }
              creditBalanceCents={creditBalanceCents}
              familyBundle={
                isFamilyBundle && plan.familyPriceCents != null && bundleComposition
                  ? {
                      plan: {
                        priceCents: plan.priceCents,
                        childPriceCents: plan.childPriceCents,
                        childMaxAge: plan.childMaxAge,
                        pricingMode: plan.pricingMode,
                        familyPriceCents: plan.familyPriceCents,
                        familyAdults: plan.familyAdults,
                        familyChildren: plan.familyChildren,
                      },
                      compositionLabel: familyBundleLabel(plan),
                      childMaxAge: bundleComposition.childMaxAge,
                    }
                  : undefined
              }
              submitLabel={submitLabel}
            />
            </>
          ) : (
            <div className="grid gap-3">
              <Link
                href={`/anmelden?next=${encodeURIComponent(`/abos/${plan.id}`)}`}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                {t("common.guestLoginToBook")}
              </Link>
              <p className="text-sm text-muted-foreground">
                {t("auth.noAccountPrefix")}{" "}
                <Link
                  href={`/registrieren?next=${encodeURIComponent(`/abos/${plan.id}`)}`}
                  className="underline"
                >
                  {t("nav.register")}
                </Link>
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
    <SubscriptionCheckoutCleanup />
    </>
  );
}
