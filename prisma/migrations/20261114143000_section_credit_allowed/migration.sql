-- AlterTable
ALTER TABLE "Section" ADD COLUMN "creditAllowed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN "sectionId" TEXT;

-- CreateTable
CREATE TABLE "SectionCreditAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SectionCreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SectionCreditAccount_userId_sectionId_key" ON "SectionCreditAccount"("userId", "sectionId");

-- CreateIndex
CREATE INDEX "SectionCreditAccount_sectionId_idx" ON "SectionCreditAccount"("sectionId");

-- CreateIndex
CREATE INDEX "CreditTransaction_sectionId_idx" ON "CreditTransaction"("sectionId");

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionCreditAccount" ADD CONSTRAINT "SectionCreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionCreditAccount" ADD CONSTRAINT "SectionCreditAccount_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "PendingRefundKind" ADD VALUE 'COURT';

-- AlterTable
ALTER TABLE "PendingRefundTransfer" ADD COLUMN "courtReservationId" TEXT;

-- CreateIndex
CREATE INDEX "PendingRefundTransfer_courtReservationId_idx" ON "PendingRefundTransfer"("courtReservationId");
