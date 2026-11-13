ALTER TABLE "Subscription" ADD COLUMN "creditAppliedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditTransaction" ADD COLUMN "subscriptionId" TEXT;
CREATE INDEX "CreditTransaction_subscriptionId_idx" ON "CreditTransaction"("subscriptionId");
