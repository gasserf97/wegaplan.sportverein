import Link from "next/link";
import type { SubscriptionInterval } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { CourseCard } from "@/components/course-card";
import { DemoLogins } from "@/components/demo-logins";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import {
  getLoggedInHomePath,
  getMembershipCheckoutPath,
  getPublishedMembershipPlan,
  shouldShowMembershipNotices,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { intervalMeta, publiclyVisiblePlanWhere, sortPlansForCatalog } from "@/lib/subscriptions";
import { planCardDisplay } from "@/lib/pricing";
import {
  catalogCardGridClass,
  catalogUsesCompactCards,
} from "@/lib/catalog-layout";
import { loadBookableCoursesWithSpotsLeft } from "@/lib/courses";
import { expireStalePendingEnrollments } from "@/lib/expire-pending";
import { CourseCheckoutCleanup } from "@/components/court-checkout-cleanup";
import { getServerI18n } from "@/lib/i18n";
import type { TFunction } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

function intervalPerLabel(interval: SubscriptionInterval, t: TFunction): string {
  return intervalMeta(interval, t).per;
}

export default async function HomePage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (user) {
    redirect(await getLoggedInHomePath(user.id));
  }

  await expireStalePendingEnrollments();

  const [courses, rawPlans, membershipPlan] = await Promise.all([
    loadBookableCoursesWithSpotsLeft(),
    prisma.subscriptionPlan.findMany({
      where: publiclyVisiblePlanWhere(),
    }),
    getPublishedMembershipPlan(),
  ]);
  const plans = sortPlansForCatalog(rawPlans);
  const membershipHref = await getMembershipCheckoutPath();
  const membershipPlanCard = plans.find((plan) => plan.kind === "MEMBERSHIP");
  const guestSteps = [
    {
      step: "01",
      title: t("home.step1TitleGuest"),
      text: t("home.step1DescGuest"),
    },
    {
      step: "02",
      title: t("home.step2TitleGuest"),
      text: membershipPlan
        ? t("home.step2DescGuestPlanOnly", { title: membershipPlan.title })
        : membershipPlanCard
          ? t("home.step2DescGuestPlanOnly", { title: membershipPlanCard.title })
          : t("home.step2DescGuest"),
    },
    {
      step: "03",
      title: t("home.step3TitleGuest"),
      text: t("home.step3DescGuest"),
    },
  ];

  return (
    <div>
      <CourseCheckoutCleanup />

      <section className="relative overflow-hidden border-b border-border bg-[#f8f8f8]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(135deg, #e40000 0%, #228212 50%, #007c94 100%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:py-20">
          <div className="space-y-5">
            <p className="text-xs font-semibold tracking-[0.22em] text-primary uppercase">
              {t("home.eyebrow")}
            </p>
            <h1 className="max-w-xl text-5xl leading-[1.05] text-foreground sm:text-6xl">
              {t("home.headingGuest")}
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
              {t("home.descGuest")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={membershipHref}
                className={cn(buttonVariants({ size: "lg" }))}
              >
                {t("home.ctaMembership")}
              </Link>
              <Link
                href="/registrieren"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                {t("home.ctaRegister")}
              </Link>
            </div>
          </div>
          <DemoLogins t={t} />
        </div>
        <ol className="relative mx-auto grid w-full max-w-6xl gap-4 px-4 pb-14 sm:grid-cols-3 sm:px-6">
          {guestSteps.map((item) => (
            <li key={item.step} className="flex gap-4 rounded-xl border border-border bg-white p-4">
              <span className="font-heading text-2xl font-bold text-primary">
                {item.step}
              </span>
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm leading-6 text-muted-foreground">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl text-primary sm:text-4xl">{t("home.currentCourses")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {shouldShowMembershipNotices()
                ? t("home.coursesHint")
                : t("courses.hintMember")}
            </p>
          </div>
          <Link
            href="/kurse"
            className="hidden text-sm font-medium text-primary underline-offset-4 hover:underline sm:inline"
          >
            {t("common.allCourses")}
          </Link>
        </div>
        {courses.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-8 text-muted-foreground">
            {t("home.noCourses")}
          </p>
        ) : (
          <div className={catalogCardGridClass(courses.length)}>
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                id={course.id}
                title={course.title}
                description={course.description}
                priceCents={course.priceCents}
                location={course.location}
                scheduleWeekdays={course.scheduleWeekdays}
                scheduleStartMinute={course.scheduleStartMinute}
                scheduleEndMinute={course.scheduleEndMinute}
                accent={course.accent}
                startsAt={course.startsAt}
                endsAt={course.endsAt}
                registrationDeadline={course.registrationDeadline}
                audienceMinAge={course.audienceMinAge}
                audienceMaxAge={course.audienceMaxAge}
                spotsLeft={course.spotsLeft}
                showPrice={false}
                compact={catalogUsesCompactCards(courses.length)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl text-primary sm:text-4xl">{t("home.subscriptionsHeading")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {shouldShowMembershipNotices()
                ? t("home.subscriptionsHint")
                : t("home.subscriptionsHintMember")}
            </p>
          </div>
          <Link
            href="/abos"
            className="hidden text-sm font-medium text-primary underline-offset-4 hover:underline sm:inline"
          >
            {t("common.allSubscriptions")}
          </Link>
        </div>
        {plans.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-8 text-muted-foreground">
            {t("home.noSubscriptions")}
          </p>
        ) : (
          <div className={catalogCardGridClass(plans.length)}>
            {plans.map((plan) => {
              const price = planCardDisplay(plan, null);
              return (
                <CourseCard
                  key={plan.id}
                  id={plan.id}
                  title={plan.title}
                  description={plan.description}
                  priceCents={price.priceCents}
                  priceLabel={price.priceLabel}
                  accent={plan.accent}
                  href={`/abos/${plan.id}`}
                  showPrice={false}
                  compact={catalogUsesCompactCards(plans.length)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
