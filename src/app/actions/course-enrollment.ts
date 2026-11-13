"use server";
import { getCurrentUser } from "@/lib/auth";
import { canActFor } from "@/lib/family";
import {
  getOrCreateCourseEnrollment,
  resolveMemberIds,
  validateCourseEnrollmentSelection,
} from "@/lib/course-enrollment";
import { uploadMedicalCertificateForEnrollment } from "@/lib/medical-certificate-upload";
import { prisma } from "@/lib/prisma";
import { resolveCoursePrice } from "@/lib/pricing";
import { revalidateEnrollmentViews } from "@/lib/revalidate-enrollments";

export type PrepareEnrollmentState =
  | { error: string }
  | {
      enrollments: Array<{
        enrollmentId: string;
        userId: string;
        userName: string;
        priceCents: number;
        hasAttest: boolean;
        fileName?: string;
        uploadedKinds: import("@/generated/prisma/client").EnrollmentDocumentKind[];
      }>;
    }
  | null;

export async function prepareCourseEnrollmentsAction(
  courseId: string,
  memberIds?: string[],
): Promise<PrepareEnrollmentState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Bitte melden Sie sich an." };
  const members = await resolveMemberIds(user.id, memberIds);
  if ("error" in members) return { error: members.error };
  const validation = await validateCourseEnrollmentSelection(
    user.id,
    courseId,
    members.ids,
    user.role === "ADMIN",
  );
  if ("error" in validation) return { error: validation.error };
  const enrollments = [];
  for (const memberId of members.ids) {
    const result = await getOrCreateCourseEnrollment(memberId, courseId);
    if (!result.ok) {
      if ("alreadyPaid" in result && result.alreadyPaid) continue;
      const person = validation.personById.get(memberId);
      return { error: `${person?.name ?? "Person"}: ${result.error}` };
    }
    await prisma.enrollment.update({
      where: { id: result.enrollment.id },
      data: { purchasedById: user.id },
    });
    const person = validation.personById.get(memberId);
    const price = resolveCoursePrice(
      validation.course,
      person?.birthDate ?? null,
    );
    enrollments.push({
      enrollmentId: result.enrollment.id,
      userId: memberId,
      userName: person?.name ?? "Mitglied",
      priceCents: price.cents,
      hasAttest: Boolean(result.enrollment.medicalCertificate),
      fileName: result.enrollment.medicalCertificate?.originalName,
      uploadedKinds: result.enrollment.documents.map((doc) => doc.kind),
    });
  }
  if (enrollments.length === 0) {
    return { error: "Niemand in der Auswahl kann diesen Kurs buchen." };
  }
  revalidateEnrollmentViews(courseId);
  return { enrollments };
}

export type UploadAttestState =
  { error: string } | { ok: true; fileName: string } | null;

export async function uploadMedicalCertificateAction(
  enrollmentId: string,
  formData: FormData,
): Promise<UploadAttestState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Bitte melden Sie sich an." };
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Bitte eine Datei auswählen." };
  }
  return uploadMedicalCertificateForEnrollment(enrollmentId, user.id, file);
}
