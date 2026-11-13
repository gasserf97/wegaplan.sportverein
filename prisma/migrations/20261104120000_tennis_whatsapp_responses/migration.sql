-- CreateEnum
CREATE TYPE "TennisWhatsAppChoice" AS ENUM ('ALREADY_MEMBER', 'NO_INTEREST');

-- CreateTable
CREATE TABLE "TennisWhatsAppResponse" (
    "id" TEXT NOT NULL,
    "choice" "TennisWhatsAppChoice" NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TennisWhatsAppResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TennisWhatsAppResponse_choice_idx" ON "TennisWhatsAppResponse"("choice");

-- CreateIndex
CREATE INDEX "TennisWhatsAppResponse_createdAt_idx" ON "TennisWhatsAppResponse"("createdAt");

-- CreateIndex
CREATE INDEX "TennisWhatsAppResponse_userId_idx" ON "TennisWhatsAppResponse"("userId");

-- AddForeignKey
ALTER TABLE "TennisWhatsAppResponse" ADD CONSTRAINT "TennisWhatsAppResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
