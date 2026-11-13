import type { EnrollmentDocumentKind, Prisma } from "@/generated/prisma/client";

export type CourseDocumentFlags = {
  requiresDocuments: boolean;
  requiresMedicalCertificate: boolean;
  requiresPassportPhoto: boolean;
  requiresIdFront: boolean;
  requiresIdBack: boolean;
  requiresHealthCard: boolean;
};

export type DocumentRequirement = {
  kind: EnrollmentDocumentKind;
  mandatory: boolean;
};

export const DOCUMENT_KIND_LABELS: Record<EnrollmentDocumentKind, string> = {
  PASSPORT_PHOTO: "Passfoto",
  ID_FRONT: "Ausweis vorne",
  ID_BACK: "Ausweis hinten",
  HEALTH_CARD: "Sanitätskarte",
  MEDICAL_CERTIFICATE: "Ärztliches Attest",
};

export const DOCUMENT_KIND_FILE_PREFIX: Record<EnrollmentDocumentKind, string> = {
  PASSPORT_PHOTO: "Passfoto",
  ID_FRONT: "Ausweis-vorne",
  ID_BACK: "Ausweis-hinten",
  HEALTH_CARD: "Sanitaetskarte",
  MEDICAL_CERTIFICATE: "Attest",
};

export function courseDocumentRequirements(
  course: CourseDocumentFlags,
): DocumentRequirement[] {
  if (!course.requiresDocuments) return [];
  const requirements: DocumentRequirement[] = [];
  if (course.requiresPassportPhoto) {
    requirements.push({ kind: "PASSPORT_PHOTO", mandatory: true });
  }
  if (course.requiresIdFront) {
    requirements.push({ kind: "ID_FRONT", mandatory: true });
  }
  if (course.requiresIdBack) {
    requirements.push({ kind: "ID_BACK", mandatory: true });
  }
  if (course.requiresHealthCard) {
    requirements.push({ kind: "HEALTH_CARD", mandatory: true });
  }
  if (course.requiresMedicalCertificate) {
    requirements.push({ kind: "MEDICAL_CERTIFICATE", mandatory: false });
  }
  return requirements;
}

export function courseHasAnyDocumentRequirement(course: CourseDocumentFlags) {
  return courseDocumentRequirements(course).length > 0;
}

export function courseMandatoryDocumentKinds(course: CourseDocumentFlags) {
  return courseDocumentRequirements(course)
    .filter((item) => item.mandatory)
    .map((item) => item.kind);
}

export function courseOptionalDocumentKinds(course: CourseDocumentFlags) {
  return courseDocumentRequirements(course)
    .filter((item) => !item.mandatory)
    .map((item) => item.kind);
}

export function documentKindsPresent(
  documents: Array<{ kind: EnrollmentDocumentKind }>,
) {
  return new Set(documents.map((item) => item.kind));
}

export function missingDocumentKinds(
  required: EnrollmentDocumentKind[],
  documents: Array<{ kind: EnrollmentDocumentKind }>,
) {
  const present = documentKindsPresent(documents);
  return required.filter((kind) => !present.has(kind));
}

export function courseRequiredDocumentKinds(course: CourseDocumentFlags) {
  return courseDocumentRequirements(course).map((item) => item.kind);
}

/** Alle für den Kurs konfigurierten Dateien inkl. optionalem Attest. */
export function enrollmentHasAllRequiredDocuments(
  course: CourseDocumentFlags,
  documents: Array<{ kind: EnrollmentDocumentKind }>,
) {
  const required = courseRequiredDocumentKinds(course);
  if (required.length === 0) return true;
  return missingDocumentKinds(required, documents).length === 0;
}

export function missingMandatoryDocumentKinds(
  course: CourseDocumentFlags,
  documents: Array<{ kind: EnrollmentDocumentKind }>,
) {
  return missingDocumentKinds(courseMandatoryDocumentKinds(course), documents);
}

export function hasMedicalCertificate(
  documents: Array<{ kind: EnrollmentDocumentKind }>,
) {
  return documents.some((item) => item.kind === "MEDICAL_CERTIFICATE");
}

export function medicalCertificateDocument<
  T extends { kind: EnrollmentDocumentKind },
>(documents: T[]) {
  return documents.find((item) => item.kind === "MEDICAL_CERTIFICATE") ?? null;
}

export function enrollmentDocumentsInclude(): Prisma.EnrollmentInclude {
  return { documents: true };
}
