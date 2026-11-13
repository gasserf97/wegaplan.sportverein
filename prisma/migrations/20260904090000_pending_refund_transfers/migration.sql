-- CreateEnum
CREATE TYPE "PendingRefundStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PendingRefundKind" AS ENUM ('COURSE', 'DEVICE', 'SUBSCRIPTION');

-- CreateTable
CREATE TABLE "PendingRefundTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PendingRefundKind" NOT NULL,
    "status" "PendingRefundStatus" NOT NULL DEFAULT 'PENDING',
    "enrollmentId" TEXT,
    "deviceReservationId" TEXT,
    "subscriptionId" TEXT,
    "paymentMethod" "PaymentMethod",
    "externalCents" INTEGER NOT NULL,
    "stripeFeeCents" INTEGER NOT NULL DEFAULT 0,
    "payoutCents" INTEGER NOT NULL,
    "creditedCents" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sectionId" TEXT,
    "memberName" TEXT NOT NULL DEFAULT '',
    "payerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "PendingRefundTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_status_createdAt_idx" ON "PendingRefundTransfer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_userId_status_idx" ON "PendingRefundTransfer"("userId", "status");

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_enrollmentId_idx" ON "PendingRefundTransfer"("enrollmentId");

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_deviceReservationId_idx" ON "PendingRefundTransfer"("deviceReservationId");

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_subscriptionId_idx" ON "PendingRefundTransfer"("subscriptionId");

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_sectionId_idx" ON "PendingRefundTransfer"("sectionId");

-- AddForeignKey
ALTER TABLE "PendingRefundTransfer" ADD CONSTRAINT "PendingRefundTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRefundTransfer" ADD CONSTRAINT "PendingRefundTransfer_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
