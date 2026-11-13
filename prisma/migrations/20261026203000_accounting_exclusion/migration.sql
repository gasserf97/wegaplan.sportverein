-- CreateTable
CREATE TABLE "AccountingExclusion" (
    "paymentKey" TEXT NOT NULL,
    "excludedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExclusion_pkey" PRIMARY KEY ("paymentKey")
);

-- CreateIndex
CREATE INDEX "AccountingExclusion_excludedById_idx" ON "AccountingExclusion"("excludedById");

-- AddForeignKey
ALTER TABLE "AccountingExclusion" ADD CONSTRAINT "AccountingExclusion_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
