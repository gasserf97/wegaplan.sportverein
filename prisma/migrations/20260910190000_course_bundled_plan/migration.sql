-- AlterTable
ALTER TABLE "Course" ADD COLUMN "bundledPlanId" TEXT;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_bundledPlanId_fkey" FOREIGN KEY ("bundledPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Course_bundledPlanId_idx" ON "Course"("bundledPlanId");
