ALTER TABLE "CourtReservation" ADD COLUMN "creditAppliedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeviceReservation" ADD COLUMN "creditAppliedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditTransaction" ADD COLUMN "courtReservationId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN "deviceReservationId" TEXT;
CREATE INDEX "CreditTransaction_courtReservationId_idx" ON "CreditTransaction"("courtReservationId");
CREATE INDEX "CreditTransaction_deviceReservationId_idx" ON "CreditTransaction"("deviceReservationId");
