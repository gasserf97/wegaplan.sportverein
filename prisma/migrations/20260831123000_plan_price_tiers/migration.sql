-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "childPriceCents" INTEGER;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "childMaxAge" INTEGER NOT NULL DEFAULT 18;

ALTER TABLE "Subscription" ADD COLUMN "paidCents" INTEGER;

UPDATE "SubscriptionPlan"
SET "childPriceCents" = 600, "childMaxAge" = 18, "title" = 'Vereinsmitgliedschaft'
WHERE "id" = 'abo-mitgliedschaft';

UPDATE "SubscriptionPlan"
SET "childPriceCents" = 5000, "childMaxAge" = 18
WHERE "id" = 'abo-tennis-saison';
