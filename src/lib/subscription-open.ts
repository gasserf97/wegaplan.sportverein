import { prisma } from "@/lib/prisma";
import { currentlyValidSubscriptionFilter } from "@/lib/subscriptions";

/** Open row for checkout: a still-valid ACTIVE period, else latest ACTIVE/PENDING. */
export async function findOpenSubscriptionForPlan(
  userId: string,
  planId: string,
  now = new Date(),
) {
  const valid = await prisma.subscription.findFirst({
    where: { userId, planId, ...currentlyValidSubscriptionFilter(now) },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
  });
  if (valid) return { subscription: valid, currentlyValid: true as const };

  const existing = await prisma.subscription.findFirst({
    where: { userId, planId, status: { in: ["PENDING", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  });
  return { subscription: existing, currentlyValid: false as const };
}
