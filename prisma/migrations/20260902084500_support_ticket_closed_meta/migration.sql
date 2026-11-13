-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "closedById" TEXT;

-- CreateIndex
CREATE INDEX "SupportTicket_closedById_idx" ON "SupportTicket"("closedById");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
