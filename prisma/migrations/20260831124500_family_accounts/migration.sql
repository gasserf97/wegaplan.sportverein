-- AlterTable
ALTER TABLE "User" ADD COLUMN "managedById" TEXT;

CREATE INDEX "User_managedById_idx" ON "User"("managedById");

ALTER TABLE "User" ADD CONSTRAINT "User_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription" ADD COLUMN "purchasedById" TEXT;

CREATE INDEX "Subscription_purchasedById_idx" ON "Subscription"("purchasedById");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Enrollment" ADD COLUMN "purchasedById" TEXT;

CREATE INDEX "Enrollment_purchasedById_idx" ON "Enrollment"("purchasedById");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
