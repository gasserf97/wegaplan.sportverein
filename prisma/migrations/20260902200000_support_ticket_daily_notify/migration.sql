-- CreateTable
CREATE TABLE "SupportTicketDailyNotify" (
    "dayKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketDailyNotify_pkey" PRIMARY KEY ("dayKey")
);
