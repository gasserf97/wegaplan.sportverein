-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "paymentReference" TEXT,
ADD COLUMN "bankTransferGroupId" TEXT,
ADD COLUMN "bankTransferApprovedAt" TIMESTAMP(3),
ADD COLUMN "bankTransferApprovedById" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "paymentReference" TEXT,
ADD COLUMN "bankTransferGroupId" TEXT,
ADD COLUMN "bankTransferApprovedAt" TIMESTAMP(3),
ADD COLUMN "bankTransferApprovedById" TEXT;

-- CreateIndex
CREATE INDEX "Enrollment_paymentReference_idx" ON "Enrollment"("paymentReference");

-- CreateIndex
CREATE INDEX "Enrollment_bankTransferGroupId_idx" ON "Enrollment"("bankTransferGroupId");

-- CreateIndex
CREATE INDEX "Subscription_paymentReference_idx" ON "Subscription"("paymentReference");

-- CreateIndex
CREATE INDEX "Subscription_bankTransferGroupId_idx" ON "Subscription"("bankTransferGroupId");
