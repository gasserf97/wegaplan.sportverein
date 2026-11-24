-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "forwardedAt" TIMESTAMP(3),
ADD COLUMN "forwardedById" TEXT,
ADD COLUMN "forwardNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN "platformStatus" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "platformClosedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupportTicket_forwardedAt_idx" ON "SupportTicket"("forwardedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_forwardedById_idx" ON "SupportTicket"("forwardedById");

-- CreateIndex
CREATE INDEX "SupportTicket_platformStatus_idx" ON "SupportTicket"("platformStatus");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_forwardedById_fkey" FOREIGN KEY ("forwardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
