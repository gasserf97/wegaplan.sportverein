-- CreateTable
CREATE TABLE "ClubEvent" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "audienceAll" BOOLEAN NOT NULL DEFAULT false,
    "audienceClub" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEventSection" (
    "eventId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "ClubEventSection_pkey" PRIMARY KEY ("eventId","sectionId")
);

-- CreateTable
CREATE TABLE "ClubEventRead" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubEventRead_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "ClubEvent_startsAt_endsAt_idx" ON "ClubEvent"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ClubEvent_createdById_idx" ON "ClubEvent"("createdById");

-- CreateIndex
CREATE INDEX "ClubEventSection_sectionId_idx" ON "ClubEventSection"("sectionId");

-- CreateIndex
CREATE INDEX "ClubEventRead_userId_idx" ON "ClubEventRead"("userId");

-- AddForeignKey
ALTER TABLE "ClubEvent" ADD CONSTRAINT "ClubEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventSection" ADD CONSTRAINT "ClubEventSection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ClubEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventSection" ADD CONSTRAINT "ClubEventSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventRead" ADD CONSTRAINT "ClubEventRead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ClubEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventRead" ADD CONSTRAINT "ClubEventRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
