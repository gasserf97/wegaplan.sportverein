"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAccent } from "@/lib/accents";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { activeCourseEnrollmentWhere } from "@/lib/course-export";
import { formChecked, formText } from "@/lib/form-draft";
import { parseEuroToCents } from "@/lib/format";
import { canManageCourse, canManageSection } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { bundledMembershipPlanError } from "@/lib/course-bundled-plan";
import { parseClock } from "@/lib/course-schedule";
import { sectionListOrderBy } from "@/lib/section-order";

export type CourseDraftFields = {
  title: string;
  confirmationTitle: string;
  description: string;
  location: string;
  scheduleWeekdays: string;
  scheduleStart: string;
  scheduleEnd: string;
  priceEuro: string;
  childPriceEuro: string;
  childMaxAge: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  audienceMinAge: string;
  audienceMaxAge: string;
  maxParticipants: string;
  cancelDeadlineDaysBeforeStart: string;
  published: boolean;
  requiresDocuments: boolean;
  requiresMedicalCertificate: boolean;
  requiresPassportPhoto: boolean;
  requiresIdFront: boolean;
  requiresIdBack: boolean;
  requiresHealthCard: boolean;
  allowBankTransfer: boolean;
  allowWithoutMembership: boolean;
  bundledPlanId: string;
  sectionId: string;
};

export type CourseFormState =
  | { error: string; fields?: CourseDraftFields }
  | null;

function courseDraftFromForm(formData: FormData): CourseDraftFields {
  return {
    title: formText(formData, "title"),
    confirmationTitle: formText(formData, "confirmationTitle"),
    description: formText(formData, "description"),
    location: formText(formData, "location"),
    scheduleWeekdays: formData
      .getAll("scheduleWeekday")
      .map((value) => String(value))
      .join(","),
    scheduleStart: formText(formData, "scheduleStart"),
    scheduleEnd: formText(formData, "scheduleEnd"),
    priceEuro: formText(formData, "price"),
    childPriceEuro: formText(formData, "childPrice"),
    childMaxAge: formText(formData, "childMaxAge") || "18",
    startsAt: formText(formData, "startsAt"),
    endsAt: formText(formData, "endsAt"),
    registrationDeadline: formText(formData, "registrationDeadline"),
    audienceMinAge: formText(formData, "audienceMinAge"),
    audienceMaxAge: formText(formData, "audienceMaxAge"),
    maxParticipants: formText(formData, "maxParticipants"),
    cancelDeadlineDaysBeforeStart: formText(
      formData,
      "cancelDeadlineDaysBeforeStart",
    ),
    published: formChecked(formData, "published"),
    requiresDocuments: formChecked(formData, "requiresDocuments"),
    requiresMedicalCertificate: formChecked(
      formData,
      "requiresMedicalCertificate",
    ),
    requiresPassportPhoto: formChecked(formData, "requiresPassportPhoto"),
    requiresIdFront: formChecked(formData, "requiresIdFront"),
    requiresIdBack: formChecked(formData, "requiresIdBack"),
    requiresHealthCard: formChecked(formData, "requiresHealthCard"),
    allowBankTransfer: formChecked(formData, "allowBankTransfer"),
    allowWithoutMembership: formChecked(formData, "allowWithoutMembership"),
    bundledPlanId: formText(formData, "bundledPlanId"),
    sectionId: formText(formData, "sectionId"),
  };
}

function courseError(error: string, formData: FormData): CourseFormState {
  return { error, fields: courseDraftFromForm(formData) };
}

const courseSchema = z.object({
  title: z.string().trim().min(3, { error: "Bitte einen Titel angeben." }),
  description: z.string().trim(),
  location: z.string().trim(),
  price: z.string().optional(),
  childPrice: z.string().optional(),
  childMaxAge: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  sectionId: z.string().min(1, { error: "Bitte eine Sektion wählen." }),
});

type CourseInput = {
  title: string;
  confirmationTitle: string | null;
  description: string;
  location: string;
  scheduleWeekdays: number[];
  scheduleStartMinute: number | null;
  scheduleEndMinute: number | null;
  accent: string;
  priceCents: number;
  childPriceCents: number | null;
  childMaxAge: number;
  startsAt: Date | null;
  endsAt: Date | null;
  registrationDeadline: Date | null;
  audienceMinAge: number | null;
  audienceMaxAge: number | null;
  maxParticipants: number | null;
  cancelDeadlineDaysBeforeStart: number | null;
  published: boolean;
  requiresDocuments: boolean;
  requiresMedicalCertificate: boolean;
  requiresPassportPhoto: boolean;
  requiresIdFront: boolean;
  requiresIdBack: boolean;
  requiresHealthCard: boolean;
  sendConfirmationEmail: boolean;
  allowBankTransfer: boolean;
  sectionId: string;
};

const BUNDLED_PLAN_ADMIN_ONLY =
  "Die Folgemitgliedschaft kann nur ein SuperAdmin hinterlegen. Bitte wenden Sie sich an einen Admin.";

const WITHOUT_MEMBERSHIP_ADMIN_ONLY =
  "„Ohne Mitgliedschaft buchbar“ kann nur ein SuperAdmin setzen. Bitte wenden Sie sich an einen Admin.";

function parseOptionalInt(
  value: FormDataEntryValue | null,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `Bitte einen gültigen Wert für ${label} angeben.` };
  }
  return { ok: true, value: parsed };
}

function parseCourseSchedule(formData: FormData):
  | { ok: true; weekdays: number[]; startMinute: number | null; endMinute: number | null }
  | { ok: false; error: string } {
  const weekdays = [
    ...new Set(
      formData
        .getAll("scheduleWeekday")
        .map((value) => Number.parseInt(String(value), 10))
        .filter((day) => day >= 1 && day <= 7),
    ),
  ].sort((a, b) => a - b);
  const startRaw = formText(formData, "scheduleStart").trim();
  const endRaw = formText(formData, "scheduleEnd").trim();
  if (weekdays.length === 0 && !startRaw && !endRaw) {
    return { ok: true, weekdays: [], startMinute: null, endMinute: null };
  }
  if (weekdays.length === 0 || !startRaw || !endRaw) {
    return {
      ok: false,
      error: "Bitte Wochentag sowie Beginn und Ende der Kurszeit angeben.",
    };
  }
  const startMinute = parseClock(startRaw);
  const endMinute = parseClock(endRaw);
  if (startMinute == null || endMinute == null) {
    return { ok: false, error: "Bitte eine gültige Kurszeit angeben." };
  }
  if (endMinute <= startMinute) {
    return {
      ok: false,
      error: "Das Ende der Kurszeit muss nach dem Beginn liegen.",
    };
  }
  return { ok: true, weekdays, startMinute, endMinute };
}

async function accentForSection(sectionId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { accent: true },
  });
  return resolveAccent(section?.accent ?? "red");
}

async function parseCourse(
  formData: FormData,
): Promise<{ ok: true; data: CourseInput } | { ok: false; error: string }> {
  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    location: formData.get("location"),
    price: formData.get("price"),
    childPrice: formData.get("childPrice") ?? "",
    childMaxAge: formData.get("childMaxAge") ?? "18",
    startsAt: formData.get("startsAt") || undefined,
    endsAt: formData.get("endsAt") || undefined,
    sectionId: formData.get("sectionId"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." };
  }

  const priceRaw = parsed.data.price?.trim() ?? "";
  const childRaw = parsed.data.childPrice?.trim() ?? "";
  if (!priceRaw && !childRaw) {
    return {
      ok: false,
      error: "Bitte einen Erwachsenen- oder Kinderpreis in Euro angeben.",
    };
  }

  let priceCents = 0;
  if (priceRaw) {
    const parsedAdult = parseEuroToCents(priceRaw);
    if (parsedAdult === null) {
      return { ok: false, error: "Bitte einen gültigen Erwachsenenpreis in Euro angeben." };
    }
    priceCents = parsedAdult;
  }

  let childPriceCents: number | null = null;
  if (childRaw) {
    childPriceCents = parseEuroToCents(childRaw);
    if (childPriceCents === null) {
      return { ok: false, error: "Bitte einen gültigen Kinderpreis in Euro angeben." };
    }
  }

  const childMaxAge = Number.parseInt(parsed.data.childMaxAge || "18", 10);
  if (!Number.isFinite(childMaxAge) || childMaxAge < 1 || childMaxAge > 21) {
    return { ok: false, error: "Kinderpreis: Alter zwischen 1 und 21 Jahren angeben." };
  }

  const startsAt = parsed.data.startsAt
    ? new Date(`${parsed.data.startsAt}T09:00:00`)
    : null;
  const endsAt = parsed.data.endsAt
    ? new Date(`${parsed.data.endsAt}T18:00:00`)
    : null;

  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Bitte ein gültiges Startdatum wählen." };
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Bitte ein gültiges Enddatum wählen." };
  }
  if (startsAt && endsAt && endsAt < startsAt) {
    return { ok: false, error: "Das Enddatum darf nicht vor dem Startdatum liegen." };
  }

  const schedule = parseCourseSchedule(formData);
  if (!schedule.ok) return { ok: false, error: schedule.error };

  const registrationDeadlineRaw = String(formData.get("registrationDeadline") ?? "").trim();
  const registrationDeadline = registrationDeadlineRaw
    ? new Date(`${registrationDeadlineRaw}T12:00:00`)
    : null;

  if (registrationDeadline && Number.isNaN(registrationDeadline.getTime())) {
    return { ok: false, error: "Bitte ein gültiges Datum für den Anmeldeschluss wählen." };
  }

  const audienceMinAge = parseOptionalInt(formData.get("audienceMinAge"), "Mindestalter");
  if (!audienceMinAge.ok) return { ok: false, error: audienceMinAge.error };

  const audienceMaxAge = parseOptionalInt(formData.get("audienceMaxAge"), "Höchstalter");
  if (!audienceMaxAge.ok) return { ok: false, error: audienceMaxAge.error };

  if (
    audienceMinAge.value != null &&
    audienceMaxAge.value != null &&
    audienceMinAge.value > audienceMaxAge.value
  ) {
    return {
      ok: false,
      error: "Das Mindestalter darf nicht höher als das Höchstalter sein.",
    };
  }

  const maxParticipants = parseOptionalInt(
    formData.get("maxParticipants"),
    "maximale Teilnehmerzahl",
  );
  if (!maxParticipants.ok) return { ok: false, error: maxParticipants.error };
  if (maxParticipants.value != null && maxParticipants.value < 1) {
    return { ok: false, error: "Es braucht mindestens einen Platz." };
  }

  const cancelDeadlineDaysBeforeStart = parseOptionalInt(
    formData.get("cancelDeadlineDaysBeforeStart"),
    "Storno-Frist",
  );
  if (!cancelDeadlineDaysBeforeStart.ok) {
    return { ok: false, error: cancelDeadlineDaysBeforeStart.error };
  }

  const confirmationTitleRaw = formText(formData, "confirmationTitle").trim();
  const confirmationTitle =
    confirmationTitleRaw.length > 0 ? confirmationTitleRaw.slice(0, 200) : null;

  return {
    ok: true,
    data: {
      title: parsed.data.title,
      confirmationTitle,
      description: parsed.data.description,
      location: parsed.data.location,
      scheduleWeekdays: schedule.weekdays,
      scheduleStartMinute: schedule.startMinute,
      scheduleEndMinute: schedule.endMinute,
      accent: await accentForSection(parsed.data.sectionId),
      priceCents,
      childPriceCents,
      childMaxAge,
      startsAt,
      endsAt,
      registrationDeadline,
      audienceMinAge: audienceMinAge.value,
      audienceMaxAge: audienceMaxAge.value,
      maxParticipants: maxParticipants.value,
      cancelDeadlineDaysBeforeStart: cancelDeadlineDaysBeforeStart.value,
      published: formData.get("published") === "on",
      requiresDocuments: formData.get("requiresDocuments") === "on",
      requiresPassportPhoto:
        formData.get("requiresDocuments") === "on" &&
        formData.get("requiresPassportPhoto") === "on",
      requiresIdFront:
        formData.get("requiresDocuments") === "on" &&
        formData.get("requiresIdFront") === "on",
      requiresIdBack:
        formData.get("requiresDocuments") === "on" &&
        formData.get("requiresIdBack") === "on",
      requiresHealthCard:
        formData.get("requiresDocuments") === "on" &&
        formData.get("requiresHealthCard") === "on",
      requiresMedicalCertificate:
        formData.get("requiresDocuments") === "on" &&
        formData.get("requiresMedicalCertificate") === "on",
      sendConfirmationEmail: true,
      allowBankTransfer: formData.get("allowBankTransfer") === "on",
      sectionId: parsed.data.sectionId,
    },
  };
}

async function resolveBundledPlanId(
  manager: { role: "USER" | "ADMIN" },
  formData: FormData,
  previousBundledPlanId: string | null,
): Promise<{ ok: true; bundledPlanId: string | null } | { ok: false; error: string }> {
  const requested = formText(formData, "bundledPlanId") || null;
  const isSuperAdmin = manager.role === "ADMIN";

  if (!isSuperAdmin) {
    if (requested && requested !== previousBundledPlanId) {
      return { ok: false, error: BUNDLED_PLAN_ADMIN_ONLY };
    }
    return { ok: true, bundledPlanId: previousBundledPlanId };
  }

  if (requested) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: requested },
      select: { id: true, kind: true, interval: true },
    });
    if (!plan) {
      return {
        ok: false,
        error: "Die gewählte Folgemitgliedschaft wurde nicht gefunden.",
      };
    }
    const configurationError = bundledMembershipPlanError(plan);
    if (configurationError) {
      return { ok: false, error: configurationError };
    }
  }

  return { ok: true, bundledPlanId: requested };
}

async function resolveAllowWithoutMembership(
  manager: { role: "USER" | "ADMIN" },
  formData: FormData,
  previous: boolean,
): Promise<
  | { ok: true; allowWithoutMembership: boolean }
  | { ok: false; error: string }
> {
  const requested = formData.get("allowWithoutMembership") === "on";
  if (manager.role !== "ADMIN") {
    if (requested && !previous) {
      return { ok: false, error: WITHOUT_MEMBERSHIP_ADMIN_ONLY };
    }
    return { ok: true, allowWithoutMembership: previous };
  }
  return { ok: true, allowWithoutMembership: requested };
}

export async function createCourseAction(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const manager = await requireCourseManager();
  if (!manager) {
    return courseError("Keine Berechtigung, Kurse anzulegen.", formData);
  }

  const parsed = await parseCourse(formData);
  if (!parsed.ok) return courseError(parsed.error, formData);

  if (!(await canManageSection(manager.id, parsed.data.sectionId))) {
    return courseError(
      "Sie dürfen für diese Sektion keine Kurse anlegen.",
      formData,
    );
  }

  const bundled = await resolveBundledPlanId(manager, formData, null);
  if (!bundled.ok) return courseError(bundled.error, formData);

  const withoutMembership = await resolveAllowWithoutMembership(
    manager,
    formData,
    false,
  );
  if (!withoutMembership.ok) {
    return courseError(withoutMembership.error, formData);
  }

  await prisma.course.create({
    data: {
      ...parsed.data,
      bundledPlanId: bundled.bundledPlanId,
      allowWithoutMembership: withoutMembership.allowWithoutMembership,
      createdById: manager.id,
    },
  });
  revalidatePath("/");
  revalidatePath("/kurse");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateCourseAction(
  courseId: string,
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const manager = await requireCourseManager();
  if (!manager) {
    return courseError("Keine Berechtigung, Kurse zu bearbeiten.", formData);
  }

  const existing = await prisma.course.findUnique({ where: { id: courseId } });
  if (!existing) {
    return courseError("Kurs nicht gefunden.", formData);
  }

  if (!(await canManageCourse(manager.id, existing))) {
    return courseError("Sie dürfen diesen Kurs nicht bearbeiten.", formData);
  }

  const parsed = await parseCourse(formData);
  if (!parsed.ok) return courseError(parsed.error, formData);

  if (!(await canManageSection(manager.id, parsed.data.sectionId))) {
    return courseError(
      "Sie dürfen für diese Sektion keine Kurse pflegen.",
      formData,
    );
  }

  const bundled = await resolveBundledPlanId(
    manager,
    formData,
    existing.bundledPlanId,
  );
  if (!bundled.ok) return courseError(bundled.error, formData);

  const withoutMembership = await resolveAllowWithoutMembership(
    manager,
    formData,
    existing.allowWithoutMembership,
  );
  if (!withoutMembership.ok) {
    return courseError(withoutMembership.error, formData);
  }

  await prisma.course.update({
    where: { id: courseId },
    data: {
      ...parsed.data,
      bundledPlanId: bundled.bundledPlanId,
      allowWithoutMembership: withoutMembership.allowWithoutMembership,
      createdById: existing.createdById ?? manager.id,
    },
  });
  revalidatePath("/");
  revalidatePath("/kurse");
  revalidatePath(`/kurse/${courseId}`);
  revalidatePath("/admin");
  redirect("/admin");
}

export async function toggleCoursePublishedAction(courseId: string) {
  const manager = await requireCourseManager();
  if (!manager) {
    throw new Error("Nicht berechtigt.");
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    throw new Error("Kurs nicht gefunden.");
  }

  if (!(await canManageCourse(manager.id, course))) {
    throw new Error("Nicht berechtigt.");
  }

  await prisma.course.update({
    where: { id: courseId },
    data: { published: !course.published },
  });
  revalidatePath("/");
  revalidatePath("/kurse");
  revalidatePath("/admin");
}

export async function deleteCourseAction(courseId: string): Promise<{ error: string } | null> {
  const manager = await requireCourseManager();
  if (!manager) {
    return { error: "Keine Berechtigung, Kurse zu löschen." };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      _count: {
        select: {
          enrollments: { where: activeCourseEnrollmentWhere },
        },
      },
    },
  });

  if (!course) {
    return { error: "Kurs nicht gefunden." };
  }

  if (!(await canManageCourse(manager.id, course))) {
    return { error: "Sie dürfen diesen Kurs nicht löschen." };
  }

  if (course._count.enrollments > 0) {
    return {
      error:
        "Dieser Kurs kann nicht gelöscht werden, weil sich bereits jemand eingeschrieben hat.",
    };
  }

  await prisma.enrollment.deleteMany({ where: { courseId } });
  await prisma.course.delete({ where: { id: courseId } });
  revalidatePath("/");
  revalidatePath("/kurse");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function getManageableSectionsForCurrentUser() {
  const user = await getCurrentUser();
  if (!user) return [];

  if (user.role === "ADMIN") {
    return prisma.section.findMany({ orderBy: sectionListOrderBy });
  }

  const { getManagedSectionIds } = await import("@/lib/permissions");
  const ids = await getManagedSectionIds(user.id);
  return prisma.section.findMany({
    where: { id: { in: ids } },
    orderBy: sectionListOrderBy,
  });
}
