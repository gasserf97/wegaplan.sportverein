-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "stripeFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "CourtReservation" ADD COLUMN "stripeFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "DeviceReservation" ADD COLUMN "stripeFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "SubscriptionPayment" ADD COLUMN "stripeFeeCents" INTEGER;
