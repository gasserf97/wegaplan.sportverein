-- Rename card flag → bank-transfer flag (inverted product meaning).
-- Stripe is always offered when the section has Stripe; Überweisung is opt-in.

ALTER TABLE "Course" ADD COLUMN "allowBankTransfer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "allowBankTransfer" BOOLEAN NOT NULL DEFAULT false;

-- Previously bank was always available; keep it on for existing offers.
UPDATE "Course" SET "allowBankTransfer" = true;
UPDATE "SubscriptionPlan" SET "allowBankTransfer" = true;

ALTER TABLE "Course" DROP COLUMN "allowCardPayment";
ALTER TABLE "SubscriptionPlan" DROP COLUMN "allowCardPayment";

-- New plans: auto-renew opt-in by default (existing rows unchanged).
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "autoRenewOffered" SET DEFAULT false;
