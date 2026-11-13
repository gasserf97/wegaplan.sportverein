-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('MEMBERSHIP', 'ADDON');

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "kind" "PlanKind" NOT NULL DEFAULT 'ADDON';

UPDATE "SubscriptionPlan" SET "kind" = 'MEMBERSHIP' WHERE "id" = 'abo-mitgliedschaft';
