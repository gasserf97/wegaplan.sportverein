import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseRegistrationPanel } from "@/components/course-registration-panel";
import { CourseEnrollmentCancelList } from "@/components/course-enrollment-cancel-list";
import { CourseCheckoutCleanup } from "@/components/court-checkout-cleanup";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { MembershipRequired } from "@/components/membership-required";
import { Badge } from "@/components/ui/badge";
import {
  countActiveCourseEnrollments,
  isActiveCourseEnrollment,
  isCourseClosingSoon,
  isRegistrationOpen,
  personMatchesAudience,
  remainingCourseSlots,
} from "@/lib/courses";
import { courseMandatoryDocumentKinds } from "@/lib/course-documents";
import { getAccent, resolveAccent } from "@/lib/accents";
import { getCurrentUser } from "@/lib/auth";
import { listFamily } from "@/lib/family";
import { countCourseUnits, formatCourseSchedule } from "@/lib/course-schedule";
import { formatDate } from "@/lib/format";
import {
  getMembershipCheckoutPath,
  hasActiveClubMembership,
  shouldShowMembershipNotices,
} from "@/lib/membership";
import { expireStalePendingEnrollments } from "@/lib/expire-pending";
import { getCreditBalance } from "@/lib/credit";
import {
  childPriceAppliesToAllAges,
  courseCardDisplay,
  coursePriceHint,
  resolveCoursePrice,
} from "@/lib/pricing";
import { isSectionBankConfigured, isSectionStripeConfigured } from "@/lib/section-payments";
import { prisma } from "@/lib/prisma";
import {
  countWaitlistEntries,
  processExpiredWaitlistOffers,
  WAITLIST_MAX_SIZE,
  waitlistPosition,
} from "@/lib/waitlist";
import { getServerI18n } from "@/lib/i18n";
import type { TFunction } from "@/lib/i18n/types";

function formatCourseAudienceLabel(
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  t: TFunction,
): string | null {
  if (minAge == null && maxAge == null) return null;
  if (minAge != null && maxAge != null) {
    return t("courses.audienceMinMax", { min: minAge, max: maxAge });
  }
  if (maxAge != null) {
    return maxAge <= 17
      ? t("courses.audienceChildrenUpTo", { max: maxAge })
      : t("courses.audienceUpTo", { max: maxAge });
  }
  if (minAge != null) {
    return minAge >= 18
      ? t("courses.audienceAdultsFrom", { min: minAge })
      : t("courses.audienceFrom", { min: minAge });
  }
  return null;
}

function audienceMismatchLabel(
  age: number,
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  t: TFunction,
): string | null {
  if (personMatchesAudience(age, minAge, maxAge)) return null;
  const label = formatCourseAudienceLabel(minAge, maxAge, t);
  return label ? t("courses.audienceOnlyFor", { label }) : t("courses.audienceMismatch");
}

function formatSpotsLeftLabel(spotsLeft: number | null, t: TFunction): string | null {
  if (spotsLeft == null) return null;
  if (spotsLeft === 0) return t("courses.soldOut");
  if (spotsLeft === 1) return t("courses.spotsLeft1");
  return t("courses.spotsLeftN", { n: spotsLeft });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { t } = await getServerI18n();
  const { id } = await params;
  const course = await prisma.course.findUnique({ where: { id } });
  return { title: course?.title ?? t("courses.metadataFallback") };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const { id } = await params;
  await processExpiredWaitlistOffers();
  await expireStalePendingEnrollments();

  const [course, user] = await Promise.all([
    prisma.course.findUnique({
      where: { id },
      include: { section: { select: { accent: true } } },
    }),
    getCurrentUser(),
  ]);

  if (!course || (!course.published && user?.role !== "ADMIN")) {
    notFound();
  }

  const [activeEnrollments, waitlistCount, family] = await Promise.all([
    countActiveCourseEnrollments(course.id),
    countWaitlistEntries(course.id),
    user ? listFamily(user.id) : Promise.resolve([]),
  ]);
  const audienceLabel = formatCourseAudienceLabel(
    course.audienceMinAge,
    course.audienceMaxAge,
    t,
  );
  const registrationOpen = isRegistrationOpen(course.registrationDeadline);
  const spotsLeft = remainingCourseSlots(course.maxParticipants, activeEnrollments);
  const courseFull = spotsLeft === 0 && course.maxParticipants != null;
  const waitlistSpotsLeft = Math.max(0, WAITLIST_MAX_SIZE - waitlistCount);
  const waitlistAvailable = courseFull && waitlistSpotsLeft > 0;

  const buyers = await Promise.all(
    family.map(async (person) => {
      const existing = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: person.id, courseId: course.id } },
      });
      const price = resolveCoursePrice(course, person.birthDate);
      let ineligibleReason: string | undefined;

      if (!registrationOpen) {
        ineligibleReason = t("courses.enrollDeadlinePassed");
      } else if (existing?.status === "WAITLISTED") {
        const position = await waitlistPosition(course.id, existing.id);
        ineligibleReason = position
          ? t("courses.alreadyWaitlistPosition", { n: position })
          : t("courses.alreadyWaitlist");
      } else if (existing?.status === "PENDING" && existing.waitlistOfferToken) {
        ineligibleReason = t("courses.spotReserved");
      } else if (
        courseFull &&
        existing?.status !== "PAID" &&
        existing?.status !== "PENDING"
      ) {
        ineligibleReason =
          waitlistSpotsLeft === 0 ? t("courses.waitlistFull") : undefined;
      } else {
        ineligibleReason =
          audienceMismatchLabel(
            person.age,
            course.audienceMinAge,
            course.audienceMaxAge,
            t,
          ) ?? undefined;
      }

      return {
        id: person.id,
        name: person.name,
        isSelf: person.isSelf,
        age: person.age,
        priceCents: price.cents,
        bandLabel:
          price.hasChildPrice && !childPriceAppliesToAllAges(course)
            ? price.band === "child"
              ? "Kinderpreis"
              : "Erwachsenenpreis"
            : t("courses.participationLabel"),
        hasMembership:
          user?.role === "ADMIN" ||
          course.allowWithoutMembership ||
          person.hasMembership,
        alreadyHas:
          existing?.status === "PAID" ||
          existing?.status === "WAITLISTED" ||
          (existing?.status === "PENDING" &&
            (existing.paymentMethod === "BANK_TRANSFER" ||
              existing.waitlistOfferToken != null)),
        ineligibleReason,
      };
    }),
  );
  const membershipNoticesOn = shouldShowMembershipNotices();
  const requireMembership =
    membershipNoticesOn && !course.allowWithoutMembership;
  const canBuyAnyone = buyers.some(
    (person) =>
      !person.alreadyHas &&
      !person.ineligibleReason &&
      (!requireMembership || person.hasMembership),
  );
  const canJoinWaitlist = buyers.some(
    (person) =>
      !person.alreadyHas &&
      !person.ineligibleReason &&
      (!requireMembership || person.hasMembership),
  );
  const allOwnIt = buyers.length > 0 && buyers.every((person) => person.alreadyHas);
  const membershipHref = await getMembershipCheckoutPath();
  const userHasClubMembership =
    user?.role === "ADMIN" ||
    (user ? await hasActiveClubMembership(user.id) : false);
  const membershipBlocksSelf =
    Boolean(user) && requireMembership && !userHasClubMembership;
  const creditBalanceCents = user ? await getCreditBalance(user.id) : 0;
  const familyEnrollments = (
    user && family.length > 0
      ? await prisma.enrollment.findMany({
          where: {
            courseId: course.id,
            userId: { in: family.map((person) => person.id) },
            status: { in: ["PAID", "PENDING", "WAITLISTED"] },
          },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : []
  ).filter(
    (item) =>
      item.status === "WAITLISTED" ||
      isActiveCourseEnrollment(item, course.requiresMedicalCertificate),
  );

  const visual = getAccent(resolveAccent(course.section?.accent ?? course.accent));
  const priceDisplay = courseCardDisplay(course);
  const deadlineFormatted = course.registrationDeadline
    ? formatDate(course.registrationDeadline, locale)
    : null;
  const scheduleLabel = formatCourseSchedule(
    course.scheduleWeekdays,
    course.scheduleStartMinute,
    course.scheduleEndMinute,
    locale,
  );
  const unitCount = countCourseUnits(course);
  const unitsLabel =
    unitCount == null
      ? null
      : unitCount === 1
        ? t("courses.unitsOne")
        : t("courses.unitsMany", { n: unitCount });
  const closingSoon = isCourseClosingSoon(course.registrationDeadline);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
      <CourseCheckoutCleanup />
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {closingSoon ? (
            <Badge variant="warning">{t("courses.closingSoonBadge")}</Badge>
          ) : null}
          {scheduleLabel ? (
            <Badge variant="outline">{scheduleLabel}</Badge>
          ) : null}
          {course.location ? (
            <Badge variant="outline">{course.location}</Badge>
          ) : null}
          {course.startsAt && course.endsAt ? (
            <Badge variant="outline">
              {t("courses.periodDates", {
                start: formatDate(course.startsAt, locale),
                end: formatDate(course.endsAt, locale),
              })}
            </Badge>
          ) : course.startsAt ? (
            <Badge variant="outline">
              {t("courses.startDate", { date: formatDate(course.startsAt, locale) })}
            </Badge>
          ) : course.endsAt ? (
            <Badge variant="outline">
              {t("courses.endDate", { date: formatDate(course.endsAt, locale) })}
            </Badge>
          ) : null}
          {unitsLabel ? <Badge variant="outline">{unitsLabel}</Badge> : null}
          {deadlineFormatted ? (
            <Badge variant="outline">
              {t("courses.cardDeadline", { date: deadlineFormatted })}
            </Badge>
          ) : null}
          {audienceLabel ? <Badge variant="outline">{audienceLabel}</Badge> : null}
          {course.allowWithoutMembership ? (
            <Badge variant="outline">{t("courses.openWithoutMembership")}</Badge>
          ) : null}
          {course.requiresMedicalCertificate ? (
            <Badge variant="outline">{t("courses.attestRequired")}</Badge>
          ) : null}
          {course.maxParticipants != null ? (
            <Badge variant="outline">
              {formatSpotsLeftLabel(spotsLeft, t) ?? t("courses.soldOut")}
            </Badge>
          ) : null}
          {course.maxParticipants != null ? (
            <Badge variant="outline">
              {t("courses.waitlist", { count: waitlistCount, max: WAITLIST_MAX_SIZE })}
            </Badge>
          ) : null}
        </div>
        <h1
          className={`border-l-4 pl-4 text-4xl sm:text-5xl ${visual.borderClass}`}
        >
          {course.title}
        </h1>
        {course.description ? (
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            {course.description}
          </p>
        ) : null}
      </div>

      <aside className="h-fit rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">{t("courses.fee")}</p>
        <p className="mt-1 font-heading text-4xl">
          {course.childPriceCents == null && course.priceCents === 0
            ? t("courses.free")
            : priceDisplay.priceLabel}
        </p>
        {priceDisplay.priceHint ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {priceDisplay.priceHint}
          </p>
        ) : null}
        {coursePriceHint(course) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {coursePriceHint(course)}
          </p>
        ) : null}
        {user && course.allowWithoutMembership ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("courses.hintOpenWithoutMembership")}
          </p>
        ) : user && userHasClubMembership ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("courses.hintCanBook")}
          </p>
        ) : user && membershipBlocksSelf ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("courses.hintMembershipRequired")}
          </p>
        ) : !user ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("courses.hintGuest")}
          </p>
        ) : null}
        <p className="mt-2 text-xs">
          <Link href="/konto/familie" className="underline">
            {t("common.familyManage")}
          </Link>
        </p>
        <div className="mt-6 grid gap-4">
          {membershipBlocksSelf ? (
            <MembershipRequired
              href={membershipHref}
              nextLabel={t("courses.bookThisCourse")}
            />
          ) : null}

          {user && familyEnrollments.length > 0 ? (
            <CourseEnrollmentCancelList
              enrollments={familyEnrollments}
              course={{
                id: course.id,
                title: course.title,
                priceCents: course.priceCents,
                startsAt: course.startsAt,
                cancelDeadlineDaysBeforeStart: course.cancelDeadlineDaysBeforeStart,
                requiresMedicalCertificate: course.requiresMedicalCertificate,
              }}
              viewerUserId={user.id}
            />
          ) : null}

          {user && allOwnIt ? null : user && !registrationOpen ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("courses.deadlineExpiredMsg")}
              {deadlineFormatted ? ` (${deadlineFormatted})` : ""}
            </p>
          ) : user && courseFull && waitlistAvailable && canJoinWaitlist ? (
            <WaitlistPanel
              courseId={course.id}
              people={buyers}
              requiresAttest={course.requiresMedicalCertificate}
              waitlistSpotsLeft={waitlistSpotsLeft}
            />
          ) : user && courseFull ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("courses.courseSoldOut")}
              {waitlistSpotsLeft === 0 ? ` ${t("courses.waitlistFullMsg")}` : null}
            </p>
          ) : user && canBuyAnyone ? (
            <CourseRegistrationPanel
              courseId={course.id}
              people={buyers}
              requireMembership={requireMembership}
              requiresAttest={course.requiresMedicalCertificate}
              mandatoryDocumentKinds={courseMandatoryDocumentKinds(course)}
              stripeAvailable={await isSectionStripeConfigured(course.sectionId)}
              bankTransferAvailable={
                course.allowBankTransfer &&
                (await isSectionBankConfigured(course.sectionId))
              }
              creditBalanceCents={creditBalanceCents}
            />
          ) : user && membershipBlocksSelf ? null : user ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("courses.hintMembershipRequired")}
            </p>
          ) : (
            <div className="grid gap-3">
              <Link
                href={`/anmelden?next=${encodeURIComponent(`/kurse/${course.id}`)}`}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                {t("common.guestLoginToBook")}
              </Link>
              <p className="text-sm text-muted-foreground">
                {t("auth.noAccountPrefix")}{" "}
                <Link
                  href={`/registrieren?next=${encodeURIComponent(`/kurse/${course.id}`)}`}
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
  );
}
