ALTER TABLE "Course" ADD COLUMN "requiresMedicalCertificate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Enrollment" ADD COLUMN "attestConfirmedAt" TIMESTAMP(3);

CREATE TABLE "EnrollmentDocument" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "EnrollmentDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrollmentDocument_enrollmentId_key" ON "EnrollmentDocument"("enrollmentId");
CREATE UNIQUE INDEX "EnrollmentDocument_storageKey_key" ON "EnrollmentDocument"("storageKey");
CREATE INDEX "EnrollmentDocument_uploadedById_idx" ON "EnrollmentDocument"("uploadedById");

ALTER TABLE "EnrollmentDocument" ADD CONSTRAINT "EnrollmentDocument_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
