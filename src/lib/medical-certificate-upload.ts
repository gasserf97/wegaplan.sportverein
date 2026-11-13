import type { EnrollmentDocumentKind } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import {
  courseDocumentRequirements,
  DOCUMENT_KIND_LABELS,
} from "@/lib/course-documents";
import { canActFor } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import {
  deleteStoredFile,
  saveEnrollmentDocumentFile,
  saveMedicalCertificateFile,
} from "@/lib/uploads";

export type EnrollmentDocumentUploadResult =
  | { ok: true; fileName: string; kind: EnrollmentDocumentKind }
  | { error: string };

export async function uploadEnrollmentDocument(
  enrollmentId: string,
  actorUserId: string,
  file: File,
  kind: EnrollmentDocumentKind,
): Promise<EnrollmentDocumentUploadResult> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: true,
      documents: true,
    },
  });

  if (!enrollment) {
    return { error: "Anmeldung nicht gefunden." };
  }

  const requirement = courseDocumentRequirements(enrollment.course).find(
    (item) => item.kind === kind,
  );
  if (!requirement) {
    return {
      error: `${DOCUMENT_KIND_LABELS[kind]} ist für diesen Kurs nicht erforderlich.`,
    };
  }

  if (enrollment.status === "CANCELLED") {
    return {
      error: "Diese Anmeldung wurde zurückgenommen. Bitte erneut anmelden.",
    };
  }

  if (enrollment.status !== "PENDING" && enrollment.status !== "PAID" && enrollment.status !== "WAITLISTED") {
    return {
      error: "Für diese Anmeldung kann kein Dokument mehr hochgeladen werden.",
    };
  }

  if (!(await canActFor(actorUserId, enrollment.userId))) {
    return { error: "Keine Berechtigung für diese Anmeldung." };
  }

  const saved =
    kind === "MEDICAL_CERTIFICATE"
      ? await saveMedicalCertificateFile(
          enrollment.courseId,
          enrollment.id,
          file,
        )
      : await saveEnrollmentDocumentFile(
          enrollment.courseId,
          enrollment.id,
          file,
          "documents",
        );
  if (!saved.ok) return { error: saved.error };

  const existing = enrollment.documents.find((item) => item.kind === kind);

  try {
    if (existing) {
      await deleteStoredFile(existing.storageKey);
      await prisma.enrollmentDocument.delete({
        where: { id: existing.id },
      });
    }

    await prisma.$transaction([
      prisma.enrollmentDocument.create({
        data: {
          enrollmentId: enrollment.id,
          kind,
          originalName: saved.originalName,
          mimeType: saved.mimeType,
          sizeBytes: saved.sizeBytes,
          storageKey: saved.storageKey,
          uploadedById: actorUserId,
        },
      }),
      ...(kind === "MEDICAL_CERTIFICATE"
        ? [
            prisma.enrollment.update({
              where: { id: enrollment.id },
              data: { attestConfirmedAt: new Date() },
            }),
          ]
        : []),
    ]);
  } catch {
    await deleteStoredFile(saved.storageKey);
    return {
      error:
        "Das Dokument konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath(`/kurse/${enrollment.courseId}`);
  revalidatePath(`/admin/kurse/${enrollment.courseId}/anmeldungen`);
  revalidatePath("/admin");
  revalidatePath("/konto");

  return { ok: true, fileName: saved.originalName, kind };
}

export async function uploadMedicalCertificateForEnrollment(
  enrollmentId: string,
  actorUserId: string,
  file: File,
): Promise<EnrollmentDocumentUploadResult> {
  return uploadEnrollmentDocument(
    enrollmentId,
    actorUserId,
    file,
    "MEDICAL_CERTIFICATE",
  );
}
