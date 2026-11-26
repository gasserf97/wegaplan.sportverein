-- Kartenzahlungen: ein Stripe-Connect-Konto pro Sektion, nicht pro Verein.

ALTER TABLE "SectionPaymentConfig" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "SectionPaymentConfig" ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SectionPaymentConfig" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SectionPaymentConfig" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SectionPaymentConfig" ADD COLUMN "stripePayoutLast4" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "SectionPaymentConfig_stripeAccountId_key" ON "SectionPaymentConfig"("stripeAccountId");

DROP INDEX IF EXISTS "ClubSettings_stripeAccountId_key";
ALTER TABLE "ClubSettings" DROP COLUMN IF EXISTS "stripeAccountId";
ALTER TABLE "ClubSettings" DROP COLUMN IF EXISTS "stripeChargesEnabled";
ALTER TABLE "ClubSettings" DROP COLUMN IF EXISTS "stripePayoutsEnabled";
ALTER TABLE "ClubSettings" DROP COLUMN IF EXISTS "stripeDetailsSubmitted";
