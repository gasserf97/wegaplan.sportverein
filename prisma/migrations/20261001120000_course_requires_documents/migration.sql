-- AlterTable
ALTER TABLE "Course" ADD COLUMN "requiresDocuments" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: bestehende Attest-Kurse brauchen Dokumente
UPDATE "Course" SET "requiresDocuments" = true WHERE "requiresMedicalCertificate" = true;
