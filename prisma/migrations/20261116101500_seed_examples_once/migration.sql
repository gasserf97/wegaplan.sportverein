CREATE TABLE "SeedMarker" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedMarker_pkey" PRIMARY KEY ("key")
);
