-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- AlterTable
ALTER TABLE "Court" ADD COLUMN IF NOT EXISTS "priceCentsPerHour" INTEGER NOT NULL DEFAULT 1500;

-- AlterTable
ALTER TABLE "CourtReservation" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "CourtReservation" ADD COLUMN IF NOT EXISTS "guestName" TEXT;
ALTER TABLE "CourtReservation" ADD COLUMN IF NOT EXISTS "guestEmail" TEXT;
ALTER TABLE "CourtReservation" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CourtReservation" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "CourtReservation" ADD COLUMN IF NOT EXISTS "stripeSessionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourtReservation_stripeSessionId_idx" ON "CourtReservation"("stripeSessionId");

-- DropForeignKey
ALTER TABLE "CourtReservation" DROP CONSTRAINT IF EXISTS "CourtReservation_userId_fkey";

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
