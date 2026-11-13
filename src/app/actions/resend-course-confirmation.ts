"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { sendCourseEnrollmentConfirmation } from "@/lib/booking-confirmation";
import { canActFor } from "@/lib/family";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidateEnrollmentViews } from "@/lib/revalidate-enrollments";

export type ResendCourseConfirmationState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function resendCourseConfirmationAction(
  _prev: ResendCourseConfirmationState,
  formData: FormData,
): Promise<ResendCourseConfirmationState> {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  if (!enrollmentId) {
    return { ok: false, error: "Anmeldung nicht gefunden." };
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true },
  });
  if (!enrollment) {
    return { ok: false, error: "Anmeldung nicht gefunden." };
  }
  if (enrollment.status !== "PAID") {
    return {
      ok: false,
      error: "Bestätigung nur für bezahlte Anmeldungen möglich.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Bitte melden Sie sich an." };
  }

  const manager = await requireCourseManager();
  const asManager =
    manager != null && (await canManageCourse(manager.id, enrollment.course));
  const asMember = await canActFor(user.id, enrollment.userId);

  if (!asManager && !asMember) {
    return { ok: false, error: "Keine Berechtigung." };
  }

  const result = await sendCourseEnrollmentConfirmation(enrollmentId, {
    force: true,
  });
  if (!result.sent) {
    return { ok: false, error: result.message };
  }

  revalidateEnrollmentViews(enrollment.courseId);
  revalidatePath("/konto");
  revalidatePath(`/admin/kurse/${enrollment.courseId}/anmeldungen`);

  return {
    ok: true,
    message: enrollment.confirmationEmailSentAt
      ? "Einzahlungsbestätigung erneut gesendet."
      : "Einzahlungsbestätigung gesendet.",
  };
}
