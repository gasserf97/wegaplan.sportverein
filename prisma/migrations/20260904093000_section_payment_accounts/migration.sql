-- Per-section bank transfer + Stripe account settings
ALTER TABLE "Section" ADD COLUMN "bankAccountHolder" TEXT;
ALTER TABLE "Section" ADD COLUMN "bankIban" TEXT;
ALTER TABLE "Section" ADD COLUMN "stripeSecretKey" TEXT;
ALTER TABLE "Section" ADD COLUMN "stripeWebhookSecret" TEXT;
