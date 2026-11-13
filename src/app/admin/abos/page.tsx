import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRecentRegistrations } from "@/components/admin-recent-registrations";
import { SectionFilter } from "@/components/section-filter";
import {
  DeletePlanButton,
  TogglePlanPublishedButton,
} from "@/components/plan-actions";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { formatEuro } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n";
import { getAdminSubscriptionRegistrations } from "@/lib/admin-all-registrations";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { planPriceSummary } from "@/lib/pricing";
import { getManagedSectionIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  isAllSectionsSelected,
  mergeSectionIds,
  parseSelectedSectionIds,
  sectionIdWhere,
} from "@/lib/section-filter";
import { sectionListOrderBy } from "@/lib/section-order";
import {
  currentAdminSubscriptionFilter,
  intervalMeta,
  sortPlansForCatalog,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("admin.subscriptionsTitle") };
}

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ sektion?: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/admin/abos");
  const manager = await requireCourseManager();
  if (!manager) redirect("/admin");
  const managedIds =
    user.role === "ADMIN" ? null : await getManagedSectionIds(user.id);
  const [{ sektion }, sections] = await Promise.all([
    searchParams,
    prisma.section.findMany({
      where:
        managedIds === null
          ? undefined
          : {
              id: {
                in: managedIds.length > 0 ? managedIds : ["__none__"],
              },
            },
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
  ]);
  const availableIds = sections.map((section) => section.id);
  const selectedIds = parseSelectedSectionIds(sektion, availableIds);
  const allSelected = isAllSectionsSelected(selectedIds, availableIds);
  const sectionIds = mergeSectionIds(
    managedIds,
    allSelected ? null : selectedIds,
  );
  const planFilter = sectionIdWhere(sectionIds);
  const subscriptionFilter =
    sectionIds === null ? {} : { plan: sectionIdWhere(sectionIds) };
  const [rawPlans, subscriptionRegistrations, paidSubscriptions, bundledCoursePayments] =
    await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: planFilter,
      include: {
        section: { select: { name: true } },
        _count: {
          select: {
            subscriptions: {
              where: currentAdminSubscriptionFilter(),
            },
          },
        },
      },
    }),
    getAdminSubscriptionRegistrations({
      subscriptionWhere: subscriptionFilter,
      locale,
      t,
    }),
    prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        ...subscriptionFilter,
      },
      select: {
        paidCents: true,
        creditAppliedCents: true,
        plan: { select: { priceCents: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: {
        status: "PAID",
        course: {
          bundledPlanId: { not: null },
          ...(sectionIds === null
            ? {}
            : { bundledPlan: sectionIdWhere(sectionIds) }),
        },
      },
      select: {
        paidCents: true,
        creditAppliedCents: true,
        course: { select: { priceCents: true } },
      },
    }),
  ]);
  const plans = sortPlansForCatalog(rawPlans);
  const revenue =
    paidSubscriptions.reduce(
      (sum, item) =>
        sum +
        externalPaymentDueCents(
          item.paidCents,
          item.plan.priceCents,
          item.creditAppliedCents,
          false,
        ),
      0,
    ) +
    bundledCoursePayments.reduce(
      (sum, item) =>
        sum +
        externalPaymentDueCents(
          item.paidCents,
          item.course.priceCents,
          item.creditAppliedCents,
          false,
        ),
      0,
    );
  const subscriptionEnrollmentCount = plans.reduce(
    (sum, plan) => sum + plan._count.subscriptions,
    0,
  );
  const canCreate = managedIds === null || managedIds.length > 0;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl text-primary">
            {t("admin.subscriptionsTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("admin.subscriptionsDesc")}
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/admin/abos/neu"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("admin.newSubscription")}
          </Link>
        ) : null}
      </div>
      <SectionFilter sections={sections} selectedIds={selectedIds} />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label={t("admin.statsPlans")} value={String(plans.length)} />
        <Stat
          label={t("admin.statsSubscriptionEnrollments")}
          value={String(subscriptionEnrollmentCount)}
        />
        <Stat label={t("admin.statsRevenue")} value={formatEuro(revenue)} />
      </div>
      {plans.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          {allSelected
            ? t("admin.noSubscriptions")
            : t("admin.filterEmptyPlans")}
        </p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/abos/${plan.id}/anmeldungen`}
                      className="text-lg font-medium hover:underline"
                    >
                      {plan.title}
                    </Link>
                    <Badge variant={plan.published ? "default" : "secondary"}>
                      {plan.published ? t("admin.public") : t("admin.draft")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {plan.kind === "MEMBERSHIP"
                      ? t("admin.planKindMembership")
                      : t("admin.planKindAddon")}
                    {" · "}
                    {intervalMeta(plan.interval, t).label}
                    {" · "}
                    <Link
                      href={`/admin/abos/${plan.id}/anmeldungen`}
                      className="underline hover:text-foreground"
                    >
                      {plan._count.subscriptions}{" "}
                      {plan._count.subscriptions === 1
                        ? t("admin.signupOne")
                        : t("admin.signupMany")}
                    </Link>
                  </p>
                  <p className="text-sm leading-6 break-words">
                    {planPriceSummary(plan)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                  <TogglePlanPublishedButton
                    planId={plan.id}
                    published={plan.published}
                  />
                  <Link
                    href={`/admin/abos/${plan.id}/anmeldungen`}
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem]"
                  >
                    {t("admin.attestations")}
                  </Link>
                  <Link
                    href={`/admin/abos/${plan.id}`}
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem]"
                  >
                    {t("admin.edit")}
                  </Link>
                  <DeletePlanButton
                    planId={plan.id}
                    canDelete={plan._count.subscriptions === 0}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-12 text-2xl">{t("admin.recentSubscriptionEnrollments")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("admin.recentSubscriptionTransactionsHint")}
      </p>
      <AdminRecentRegistrations
        emptyLabel={t("admin.noBookings")}
        items={subscriptionRegistrations}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-3xl">{value}</p>
    </div>
  );
}
