-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'WAITLISTED';

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "offerExpiresAt" TIMESTAMP(3),
ADD COLUMN "waitlistOfferToken" TEXT,
ADD COLUMN "promotedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_waitlistOfferToken_key" ON "Enrollment"("waitlistOfferToken");
