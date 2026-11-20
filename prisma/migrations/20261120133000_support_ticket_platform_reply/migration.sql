-- CreateTable
CREATE TABLE "SupportTicketPlatformReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketPlatformReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicketPlatformReply_ticketId_createdAt_idx" ON "SupportTicketPlatformReply"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicketPlatformReply" ADD CONSTRAINT "SupportTicketPlatformReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
