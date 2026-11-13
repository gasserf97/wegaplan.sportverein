ALTER TABLE "Section" DROP COLUMN "bankAccountHolder";
ALTER TABLE "Section" DROP COLUMN "bankIban";
ALTER TABLE "Section" DROP COLUMN "stripeSecretKey";
ALTER TABLE "Section" DROP COLUMN "stripeWebhookSecret";
ALTER TABLE "Section" ADD COLUMN "paymentEnvKey" TEXT;

CREATE UNIQUE INDEX "Section_paymentEnvKey_key" ON "Section"("paymentEnvKey");
