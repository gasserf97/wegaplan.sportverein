-- CreateEnum
CREATE TYPE "PlanPricingMode" AS ENUM ('PER_PERSON', 'FAMILY_BUNDLE');

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "pricingMode" "PlanPricingMode" NOT NULL DEFAULT 'PER_PERSON',
ADD COLUMN "familyPriceCents" INTEGER,
ADD COLUMN "familyAdults" INTEGER,
ADD COLUMN "familyChildren" INTEGER;
