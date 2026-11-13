-- AlterTable
ALTER TABLE "Course" ADD COLUMN "allowCardPayment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "allowCardPayment" BOOLEAN NOT NULL DEFAULT false;
