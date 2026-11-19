-- Ein Logo für den Verein, nicht pro Sektion.
CREATE TABLE "ClubProfile" (
    "id" TEXT NOT NULL,
    "logoStorageKey" TEXT,
    "logoMimeType" TEXT,

    CONSTRAINT "ClubProfile_pkey" PRIMARY KEY ("id")
);
