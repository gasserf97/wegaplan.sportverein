-- Ein Stripe-Connect-Konto pro Verein. Leere Konten bleiben NULL,
-- damit der Unique-Index mehrere Vereine ohne Konto zulässt.

ALTER TABLE "ClubSettings" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "ClubSettings" ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClubSettings" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClubSettings" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "ClubSettings_stripeAccountId_key" ON "ClubSettings"("stripeAccountId");
