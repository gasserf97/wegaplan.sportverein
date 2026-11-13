import { canActFor } from "@/lib/family";
import {
  hasMedicalCertificate,
  medicalCertificateDocument,
  missingMandatoryDocumentKinds,
  type CourseDocumentFlags,
} from "@/lib/course-documents";
import {
  hasActiveClubMembership,
  shouldShowMembershipNotices,
} from "@/lib/membership";
import {
  audienceMismatchReason,
  countActiveCourseEnrollments,
  isRegistrationOpen,
  remainingCourseSlots,
} from "@/lib/courses";
import { ageFromBirthDate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { getActionI18n } from "@/lib/i18n/action";
import { countWaitlistEntries, WAITLIST_MAX_SIZE, clearWaitlistOfferData } from "@/lib/waitlist";
import { DOCUMENT_KIND_LABELS } from "@/lib/course-documents";

export async function resolveMemberIds(
  actorId: string,
  memberIds: string[] | undefined,
): Promise<{ error: string } | { ids: string[] }> {
  const ids = [
    ...new Set(
      (memberIds?.length ? memberIds : [actorId]).filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
  if (ids.length === 0) {
    return { error: "Bitte mindestens eine Person auswählen." };
  }
  for (const id of ids) {
    if (!(await canActFor(actorId, id))) {
      return { error: "Sie dürfen nicht für diese Person kaufen." };
    }
  }
  return { ids };
}

export async function validateCourseEnrollmentSelection(
  actorId: string,
  courseId: string,
  memberIds: string[],
  actorIsAdmin: boolean,
): Promise<
  | { error: string }
  | {
      course: NonNullable<Awaited<ReturnType<typeof prisma.course.findUnique>>>;
      personById: Map<string, { id: string; name: string; birthDate: Date }>;
    }
> {
  const { t } = await getActionI18n();
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !course.published) {
    return { error: "Dieser Kurs ist nicht verfügbar." };
  }

  if (!isRegistrationOpen(course.registrationDeadline)) {
    return { error: "Der Anmeldeschluss für diesen Kurs ist abgelaufen." };
  }

  const activeEnrollments = await countActiveCourseEnrollments(courseId);
  const spotsLeft = remainingCourseSlots(course.maxParticipants, activeEnrollments);

  const existingByUser = await prisma.enrollment.findMany({
    where: { courseId, userId: { in: memberIds } },
    select: { userId: true, status: true, attestConfirmedAt: true },
  });
  const statusByUser = new Map(existingByUser.map((item) => [item.userId, item]));

  const newSlotsNeeded = memberIds.filter((memberId) => {
    const existing = statusByUser.get(memberId);
    if (!existing) return true;
    return existing.status !== "PAID" && existing.status !== "PENDING";
  }).length;

  if (spotsLeft != null && newSlotsNeeded > spotsLeft) {
    return {
      error:
        spotsLeft === 0
          ? "Dieser Kurs ist ausgebucht."
          : `Es sind nur noch ${spotsLeft} Plätze frei.`,
    };
  }

  const selectedPeople = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, birthDate: true },
  });
  const personById = new Map(selectedPeople.map((person) => [person.id, person]));

  for (const memberId of memberIds) {
    const person = personById.get(memberId);
    if (!person) {
      return { error: "Person nicht gefunden." };
    }
    const age = ageFromBirthDate(person.birthDate);
    const mismatch = audienceMismatchReason(
      age,
      course.audienceMinAge,
      course.audienceMaxAge,
      t,
    );
    if (mismatch) {
      return { error: `${person.name}: ${mismatch}.` };
    }
    if (
      shouldShowMembershipNotices() &&
      !course.allowWithoutMembership &&
      !(await hasActiveClubMembership(memberId)) &&
      !actorIsAdmin
    ) {
      return {
        error: `${person.name} braucht zuerst die Vereinsmitgliedschaft.`,
      };
    }
  }

  return { course, personById };
}

export async function validateWaitlistJoinSelection(
  actorId: string,
  courseId: string,
  memberIds: string[],
  actorIsAdmin: boolean,
): Promise<
  | { error: string }
  | {
      course: NonNullable<Awaited<ReturnType<typeof prisma.course.findUnique>>>;
      personById: Map<string, { id: string; name: string; birthDate: Date }>;
    }
> {
  const { t } = await getActionI18n();
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !course.published) {
    return { error: "Dieser Kurs ist nicht verfügbar." };
  }

  if (!isRegistrationOpen(course.registrationDeadline)) {
    return { error: "Der Anmeldeschluss für diesen Kurs ist abgelaufen." };
  }

  if (course.maxParticipants == null) {
    return { error: "Für diesen Kurs gibt es keine Warteliste." };
  }

  const activeEnrollments = await countActiveCourseEnrollments(courseId);
  const spotsLeft = remainingCourseSlots(course.maxParticipants, activeEnrollments);
  if (spotsLeft != null && spotsLeft > 0) {
    return { error: "Es sind noch Plätze frei – bitte direkt buchen." };
  }

  const waitlistCount = await countWaitlistEntries(courseId);
  const existingByUser = await prisma.enrollment.findMany({
    where: { courseId, userId: { in: memberIds } },
    select: { userId: true, status: true },
  });
  const statusByUser = new Map(existingByUser.map((item) => [item.userId, item.status]));

  const newWaitlistSlots = memberIds.filter((memberId) => {
    const status = statusByUser.get(memberId);
    return !status || status === "CANCELLED";
  }).length;

  if (waitlistCount + newWaitlistSlots > WAITLIST_MAX_SIZE) {
    const free = Math.max(0, WAITLIST_MAX_SIZE - waitlistCount);
    return {
      error:
        free === 0
          ? "Die Warteliste ist voll."
          : `Auf der Warteliste sind nur noch ${free} Plätze frei.`,
    };
  }

  const selectedPeople = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, birthDate: true },
  });
  const personById = new Map(selectedPeople.map((person) => [person.id, person]));

  for (const memberId of memberIds) {
    const person = personById.get(memberId);
    if (!person) {
      return { error: "Person nicht gefunden." };
    }

    const status = statusByUser.get(memberId);
    if (status === "PAID" || status === "PENDING" || status === "WAITLISTED") {
      return { error: `${person.name} ist für diesen Kurs bereits eingetragen.` };
    }

    const age = ageFromBirthDate(person.birthDate);
    const mismatch = audienceMismatchReason(
      age,
      course.audienceMinAge,
      course.audienceMaxAge,
      t,
    );
    if (mismatch) {
      return { error: `${person.name}: ${mismatch}.` };
    }
    if (
      shouldShowMembershipNotices() &&
      !course.allowWithoutMembership &&
      !(await hasActiveClubMembership(memberId)) &&
      !actorIsAdmin
    ) {
      return {
        error: `${person.name} braucht zuerst die Vereinsmitgliedschaft.`,
      };
    }
  }

  return { course, personById };
}

export async function getOrCreateCourseEnrollment(
  userId: string,
  courseId: string,
): Promise<
  | {
      ok: true;
      enrollment: {
        id: string;
        userId: string;
        courseId: string;
        status: string;
        attestConfirmedAt: Date | null;
        documents: Array<{
          kind: import("@/generated/prisma/client").EnrollmentDocumentKind;
          originalName: string;
        }>;
        medicalCertificate: {
          originalName: string;
        } | null;
      };
    }
  | { ok: false; alreadyPaid?: true; error: string }
> {
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { documents: true },
  });

  function withCompat<
    T extends {
      id: string;
      userId: string;
      courseId: string;
      status: string;
      attestConfirmedAt: Date | null;
      documents: Array<{
        kind: import("@/generated/prisma/client").EnrollmentDocumentKind;
        originalName: string;
      }>;
    },
  >(enrollment: T) {
    const medical = medicalCertificateDocument(enrollment.documents);
    return {
      ...enrollment,
      medicalCertificate: medical
        ? { originalName: medical.originalName }
        : null,
    };
  }

  if (existing?.status === "PAID") {
    return {
      ok: false,
      alreadyPaid: true,
      error: "Bereits angemeldet.",
    };
  }

  if (existing?.status === "PENDING") {
    if (existing.attestConfirmedAt && !hasMedicalCertificate(existing.documents)) {
      const fixed = await prisma.enrollment.update({
        where: { id: existing.id },
        data: { attestConfirmedAt: null },
        include: { documents: true },
      });
      return { ok: true, enrollment: withCompat(fixed) };
    }
    return { ok: true, enrollment: withCompat(existing) };
  }

  if (existing?.status === "WAITLISTED") {
    return { ok: true, enrollment: withCompat(existing) };
  }

  if (existing?.status === "CANCELLED") {
    const reactivated = await prisma.enrollment.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        attestConfirmedAt: null,
        paymentMethod: null,
        paymentReference: null,
        bankTransferGroupId: null,
        bankTransferApprovedAt: null,
        bankTransferApprovedById: null,
        stripeSessionId: null,
        paidAt: null,
        paidCents: null,
        creditAppliedCents: 0,
        ...clearWaitlistOfferData(),
      },
      include: { documents: true },
    });
    return { ok: true, enrollment: withCompat(reactivated) };
  }

  const enrollment = await prisma.enrollment.create({
    data: { userId, courseId, status: "PENDING" },
    include: { documents: true },
  });

  return { ok: true, enrollment: withCompat(enrollment) };
}

export async function enrollmentsMissingAttest(
  enrollmentIds: string[],
  courseRequiresAttest: boolean,
) {
  if (!courseRequiresAttest || enrollmentIds.length === 0) return [];
  const rows = await prisma.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    include: { user: { select: { name: true } }, documents: true },
  });
  return rows
    .filter((row) => !hasMedicalCertificate(row.documents))
    .map((row) => row.user.name);
}

export async function enrollmentsMissingMandatoryDocuments(
  enrollmentIds: string[],
  course: CourseDocumentFlags,
) {
  if (enrollmentIds.length === 0) return [];
  const rows = await prisma.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    include: { user: { select: { name: true } }, documents: true },
  });
  const missing: string[] = [];
  for (const row of rows) {
    const kinds = missingMandatoryDocumentKinds(course, row.documents);
    if (kinds.length === 0) continue;
    const labels = kinds.map((kind) => DOCUMENT_KIND_LABELS[kind]).join(", ");
    missing.push(`${row.user.name} (${labels})`);
  }
  return missing;
}
