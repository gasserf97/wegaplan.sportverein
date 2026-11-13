-- AlterTable
ALTER TABLE "CourtReservation" ADD COLUMN "receiptNumber" INTEGER;
ALTER TABLE "CourtReservation" ADD COLUMN "receiptEmailSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CourtReservation_receiptNumber_key" ON "CourtReservation"("receiptNumber");
