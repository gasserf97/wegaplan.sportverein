import { cronUnauthorizedResponse } from "@/lib/cron-auth";
import { processDueAutoRenewals } from "@/lib/subscription-renewal";
import { processExpiredWaitlistOffers } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = cronUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  const [renewals, waitlist] = await Promise.all([
    processDueAutoRenewals(),
    processExpiredWaitlistOffers(),
  ]);
  return Response.json({ ok: true, renewals, waitlist });
}
