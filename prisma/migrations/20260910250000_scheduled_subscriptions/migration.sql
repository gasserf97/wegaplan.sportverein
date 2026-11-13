ALTER TYPE "SubscriptionStatus" ADD VALUE 'SCHEDULED';

ALTER TABLE "Enrollment" ADD COLUMN "bundledPlanGrantedAt" TIMESTAMP(3);
