import { prisma } from "@/lib/prisma";

/** Angemeldete User mit Aktivität in diesem Fenster gelten als „online“. */
export const ONLINE_WINDOW_MS = 60_000;

export const CONCURRENT_METRIC_ID = "users_concurrent";

export async function countOnlineUsers(now = new Date()) {
  return prisma.user.count({
    where: {
      lastLoginAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MS) },
    },
  });
}

function concurrentValueLabel(count: number) {
  return count === 1 ? "1 User" : `${count} User`;
}

/** Höchststand mitschreiben – gedrosselt, damit Request-Pfade leicht bleiben. */
let lastPeakCheckAt = 0;

export async function recordConcurrentUsersSample() {
  const nowMs = Date.now();
  if (nowMs - lastPeakCheckAt < 30_000) return;
  lastPeakCheckAt = nowMs;

  const count = await countOnlineUsers(new Date(nowMs));
  const previous = await prisma.hostingMetricPeak.findUnique({
    where: { metricId: CONCURRENT_METRIC_ID },
  });
  if (previous && count <= previous.peakValue) return;

  const peakedAt = new Date(nowMs);
  const peakLabel = concurrentValueLabel(count);
  await prisma.hostingMetricPeak.upsert({
    where: { metricId: CONCURRENT_METRIC_ID },
    create: {
      metricId: CONCURRENT_METRIC_ID,
      peakValue: count,
      peakLabel,
      peakedAt,
    },
    update: {
      peakValue: count,
      peakLabel,
      peakedAt,
    },
  });
}

export { concurrentValueLabel };
