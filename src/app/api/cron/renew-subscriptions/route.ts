import { cronUnauthorizedResponse } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { processDueAutoRenewals } from "@/lib/subscription-renewal";
import { runWithClub } from "@/lib/tenant";
import { processExpiredWaitlistOffers } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = cronUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  const clubs = await prisma.club.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  });
  const results = [];
  for (const club of clubs) {
    const [renewals, waitlist] = await runWithClub(club.id, () =>
      Promise.all([processDueAutoRenewals(), processExpiredWaitlistOffers()]),
    );
    results.push({ slug: club.slug, renewals, waitlist });
  }
  return Response.json({ ok: true, results });
}
