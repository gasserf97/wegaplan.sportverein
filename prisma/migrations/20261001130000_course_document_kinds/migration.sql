-- AlterTable Course: zusätzliche Dokumenttypen
ALTER TABLE "Course" ADD COLUMN "requiresPassportPhoto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "requiresIdFront" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "requiresIdBack" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "requiresHealthCard" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "EnrollmentDocumentKind" AS ENUM (
  'MEDICAL_CERTIFICATE',
  'PASSPORT_PHOTO',
  'ID_FRONT',
  'ID_BACK',
  'HEALTH_CARD'
);

-- AlterTable EnrollmentDocument: mehrere Dokumente je Anmeldung
ALTER TABLE "EnrollmentDocument" ADD COLUMN "kind" "EnrollmentDocumentKind" NOT NULL DEFAULT 'MEDICAL_CERTIFICATE';

DROP INDEX IF EXISTS "EnrollmentDocument_enrollmentId_key";
ALTER TABLE "EnrollmentDocument" DROP CONSTRAINT IF EXISTS "EnrollmentDocument_enrollmentId_key";

CREATE UNIQUE INDEX "EnrollmentDocument_enrollmentId_kind_key"
  ON "EnrollmentDocument"("enrollmentId", "kind");
