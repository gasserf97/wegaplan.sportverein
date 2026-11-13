import type { Prisma } from "@/generated/prisma/client";
import {
  type CatalogBadge,
  familyAlreadyEnrolledBadge,
  paymentPendingCatalogBadge,
  preferCatalogBadge,
} from "@/lib/catalog-badges";
import { formatDate } from "@/lib/format";
import type { TFunction } from "@/lib/i18n/types";
import { checkoutHoldSince } from "@/lib/checkout-hold";
import { isCourseClosingSoon } from "@/lib/courses-display";
import { expireStalePendingEnrollments } from "@/lib/expire-pending";
import { listFamily } from "@/lib/family";
import { prisma } from "@/lib/prisma";

function startOfToday(now = new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Kurse, deren Anmeldeschluss noch nicht verstrichen ist (Ende des Frist-Tages). */
export function registrationOpenWhere(now = new Date()): Prisma.CourseWhereInput {
  const today = startOfToday(now);
  return {
    OR: [{ registrationDeadline: null }, { registrationDeadline: { gte: today } }],
  };
}

/** Kurse mit abgelaufenem Anmeldeschluss (nur wenn ein Datum gesetzt ist). */
export function registrationClosedWhere(now = new Date()): Prisma.CourseWhereInput {
  const today = startOfToday(now);
  return {
    registrationDeadline: { not: null, lt: today },
  };
}

export function bookableCourseWhere(now = new Date()): Prisma.CourseWhereInput {
  return {
    published: true,
    ...registrationOpenWhere(now),
  };
}

export function isRegistrationOpen(deadline: Date | null | undefined, now = new Date()): boolean {
  if (!deadline) return true;
  const end = new Date(deadline);
  end.setHours(23, 59, 59, 999);
  return now <= end;
}

export {
  audienceMatchesAnyAge,
  audienceMismatchReason,
  COURSE_CLOSING_SOON_DAYS,
  formatCourseAudience,
  formatCourseSpotsLeftLabel,
  formatRegistrationDeadline,
  isCourseClosingSoon,
  personMatchesAudience,
} from "@/lib/courses-display";

export function courseEnrollmentOccupiesSlotWhere(
  courseId: string,
  _requiresMedicalCertificate: boolean,
  now = new Date(),
): Prisma.EnrollmentWhereInput {
  void _requiresMedicalCertificate;
  const holdSince = checkoutHoldSince(now);
  return {
    courseId,
    OR: [
      { status: "PAID" },
      { status: "PENDING", paymentMethod: "BANK_TRANSFER" },
      {
        status: "PENDING",
        paymentMethod: { not: "BANK_TRANSFER" },
        createdAt: { gte: holdSince },
      },
    ],
  };
}

export async function countActiveCourseEnrollments(courseId: string): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { requiresMedicalCertificate: true },
  });

  return prisma.enrollment.count({
    where: courseEnrollmentOccupiesSlotWhere(
      courseId,
      course?.requiresMedicalCertificate ?? false,
    ),
  });
}

export function remainingCourseSlots(
  maxParticipants: number | null | undefined,
  activeCount: number,
): number | null {
  if (maxParticipants == null) return null;
  return Math.max(0, maxParticipants - activeCount);
}

export function isActiveCourseEnrollment(
  enrollment: {
    status: string;
    attestConfirmedAt: Date | null;
    paymentMethod: string | null;
    createdAt: Date;
  },
  _requiresMedicalCertificate: boolean,
  now = new Date(),
): boolean {
  void _requiresMedicalCertificate;
  if (enrollment.status === "PAID") return true;
  if (enrollment.status !== "PENDING") return false;
  if (enrollment.paymentMethod === "BANK_TRANSFER") return true;
  if (enrollment.createdAt < checkoutHoldSince(now)) return false;
  return true;
}

export function canCancelCourseEnrollment(
  startsAt: Date | null | undefined,
  cancelDeadlineDaysBeforeStart: number | null | undefined,
  now = new Date(),
): boolean {
  if (cancelDeadlineDaysBeforeStart == null) return false;
  // Ohne Startdatum: Storno jederzeit möglich (keine Frist berechenbar).
  if (!startsAt) return true;
  const deadline =
    startsAt.getTime() - cancelDeadlineDaysBeforeStart * 86_400_000;
  return now.getTime() <= deadline;
}

/** Kurszeitraum vorbei (Ende bzw. Starttag abgelaufen). */
export function coursePeriodEnded(
  course: { startsAt: Date | null | undefined; endsAt: Date | null | undefined },
  now = new Date(),
) {
  if (course.endsAt) return course.endsAt.getTime() < now.getTime();
  if (course.startsAt) {
    const endOfDay = new Date(course.startsAt);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime() < now.getTime();
  }
  return false;
}

export function formatCancelDeadlineDays(days: number) {
  if (days === 1) return "1 Tag";
  return `${days} Tage`;
}

export function courseCancelBlockedMessage(
  cancelDeadlineDaysBeforeStart: number | null | undefined,
  startsAt?: Date | null,
) {
  if (cancelDeadlineDaysBeforeStart == null) {
    return "Für diesen Kurs ist keine Stornierung vorgesehen.";
  }
  if (!startsAt) {
    return "Stornierung ist für diesen Kurs möglich.";
  }
  return `Stornierung nur bis ${formatCancelDeadlineDays(cancelDeadlineDaysBeforeStart)} vor Kursbeginn möglich.`;
}

export function isCourseSoldOut(spotsLeft: number | null | undefined) {
  return spotsLeft === 0;
}

export type CatalogCourseGroup = "closingSoon" | "open" | "soldOut";

type CatalogSortableCourse = {
  title: string;
  registrationDeadline: Date | null;
  spotsLeft: number | null;
};

function deadlineSortKey(deadline: Date | null | undefined) {
  return deadline?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function catalogCourseGroup(
  course: Pick<CatalogSortableCourse, "registrationDeadline" | "spotsLeft">,
  now = new Date(),
): CatalogCourseGroup {
  if (isCourseSoldOut(course.spotsLeft)) return "soldOut";
  if (isCourseClosingSoon(course.registrationDeadline, now)) return "closingSoon";
  return "open";
}

export function compareCoursesByDeadline(
  a: Pick<CatalogSortableCourse, "registrationDeadline" | "title">,
  b: Pick<CatalogSortableCourse, "registrationDeadline" | "title">,
) {
  const byDeadline =
    deadlineSortKey(a.registrationDeadline) -
    deadlineSortKey(b.registrationDeadline);
  if (byDeadline !== 0) return byDeadline;
  return a.title.localeCompare(b.title, "de");
}

/** Katalog-Reihenfolge: bald schließend → übrige → ausgebucht; innerhalb nach Anmeldefrist. */
export function sortCoursesForCatalog<T extends CatalogSortableCourse>(
  courses: T[],
  now = new Date(),
): T[] {
  const rank: Record<CatalogCourseGroup, number> = {
    closingSoon: 0,
    open: 1,
    soldOut: 2,
  };
  return [...courses].sort((a, b) => {
    const byGroup =
      rank[catalogCourseGroup(a, now)] - rank[catalogCourseGroup(b, now)];
    if (byGroup !== 0) return byGroup;
    return compareCoursesByDeadline(a, b);
  });
}

export async function loadBookableCoursesWithSpotsLeft(now = new Date()) {
  await expireStalePendingEnrollments();

  const courses = await prisma.course.findMany({
    where: bookableCourseWhere(now),
    orderBy: { startsAt: "asc" },
    include: { section: { select: { accent: true } } },
  });
  if (courses.length === 0) return [];

  const enrollments = await prisma.enrollment.findMany({
    where: {
      courseId: { in: courses.map((course) => course.id) },
      status: { in: ["PENDING", "PAID"] },
    },
    select: {
      courseId: true,
      status: true,
      attestConfirmedAt: true,
      paymentMethod: true,
      createdAt: true,
    },
  });

  const requiresAttestByCourse = new Map(
    courses.map((course) => [course.id, course.requiresMedicalCertificate]),
  );
  const activeCounts = new Map<string, number>();

  for (const enrollment of enrollments) {
    const requiresAttest = requiresAttestByCourse.get(enrollment.courseId) ?? false;
    if (!isActiveCourseEnrollment(enrollment, requiresAttest)) continue;
    activeCounts.set(
      enrollment.courseId,
      (activeCounts.get(enrollment.courseId) ?? 0) + 1,
    );
  }

  return sortCoursesForCatalog(
    courses.map((course) => ({
      ...course,
      accent: course.section?.accent ?? course.accent,
      spotsLeft: remainingCourseSlots(
        course.maxParticipants,
        activeCounts.get(course.id) ?? 0,
      ),
    })),
    now,
  );
}

/** Katalog-Badge pro Kurs (Nutzer oder Familienmitglied). */
export async function courseCatalogBadgesForUser(
  userId: string,
  courseIds: string[],
  t: TFunction,
): Promise<Map<string, CatalogBadge>> {
  if (courseIds.length === 0) return new Map();

  const family = await listFamily(userId);
  const memberIds = family.map((person) => person.id);
  const familySize = memberIds.length;

  const rows = await prisma.enrollment.findMany({
    where: {
      courseId: { in: courseIds },
      userId: { in: memberIds },
      status: { in: ["PAID", "PENDING", "WAITLISTED"] },
    },
    select: {
      courseId: true,
      userId: true,
      status: true,
      attestConfirmedAt: true,
      paymentMethod: true,
      createdAt: true,
      course: { select: { requiresMedicalCertificate: true } },
    },
  });

  const paidByCourse = new Map<string, Set<string>>();
  const otherByCourse = new Map<string, CatalogBadge>();
  const nameById = new Map(family.map((person) => [person.id, person.name]));

  for (const row of rows) {
    if (row.status === "PAID") {
      const set = paidByCourse.get(row.courseId) ?? new Set<string>();
      set.add(row.userId);
      paidByCourse.set(row.courseId, set);
      continue;
    }

    let badge: CatalogBadge | null = null;
    if (row.status === "WAITLISTED") {
      badge = { label: t("courses.catalogBadgeWaitlist"), tone: "waitlist" };
    } else if (
      row.status === "PENDING" &&
      row.paymentMethod === "BANK_TRANSFER" &&
      isActiveCourseEnrollment(row, row.course.requiresMedicalCertificate)
    ) {
      badge = paymentPendingCatalogBadge(row.paymentMethod, t);
    }
    if (badge) {
      otherByCourse.set(
        row.courseId,
        preferCatalogBadge(otherByCourse.get(row.courseId), badge),
      );
    }
  }

  const badges = new Map<string, CatalogBadge>();
  for (const courseId of courseIds) {
    const paid = paidByCourse.get(courseId);
    const enrolledNames = memberIds
      .filter((id) => paid?.has(id))
      .map((id) => nameById.get(id) ?? "")
      .filter(Boolean);
    const enrolledBadge = familyAlreadyEnrolledBadge(
      enrolledNames,
      familySize,
      t,
    );
    const other = otherByCourse.get(courseId);
    if (enrolledBadge && other) {
      badges.set(courseId, preferCatalogBadge(other, enrolledBadge));
    } else if (enrolledBadge) {
      badges.set(courseId, enrolledBadge);
    } else if (other) {
      badges.set(courseId, other);
    }
  }
  return badges;
}
