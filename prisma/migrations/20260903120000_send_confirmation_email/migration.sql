-- AlterTable
ALTER TABLE "Course" ADD COLUMN "sendConfirmationEmail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "sendConfirmationEmail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);
