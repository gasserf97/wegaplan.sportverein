-- CreateTable
CREATE TABLE "HostingMetricPeak" (
    "metricId" TEXT NOT NULL,
    "peakValue" DOUBLE PRECISION NOT NULL,
    "peakLabel" TEXT NOT NULL,
    "peakedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostingMetricPeak_pkey" PRIMARY KEY ("metricId")
);
