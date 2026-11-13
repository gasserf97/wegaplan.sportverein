-- CreateEnum
CREATE TYPE "DevicePricingMode" AS ENUM ('HOURLY', 'DAILY');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Fahrzeug',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "pricingMode" "DevicePricingMode" NOT NULL DEFAULT 'DAILY',
    "priceCents" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceReservation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "billingMode" "DevicePricingMode" NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "stripeSessionId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceReservation_deviceId_startsAt_idx" ON "DeviceReservation"("deviceId", "startsAt");

-- CreateIndex
CREATE INDEX "DeviceReservation_userId_startsAt_idx" ON "DeviceReservation"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "DeviceReservation_stripeSessionId_idx" ON "DeviceReservation"("stripeSessionId");

-- AddForeignKey
ALTER TABLE "DeviceReservation" ADD CONSTRAINT "DeviceReservation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceReservation" ADD CONSTRAINT "DeviceReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
