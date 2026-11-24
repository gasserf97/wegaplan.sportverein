import { cronUnauthorizedResponse } from "@/lib/cron-auth";
import { sendRegistrationBackupEmail } from "@/lib/registration-backup";
import { prisma } from "@/lib/prisma";
import { runWithClub } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = cronUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  const clubs = await prisma.club.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  });
  const results = [];
  for (const club of clubs) {
    const result = await runWithClub(club.id, () => sendRegistrationBackupEmail());
    results.push({ slug: club.slug, ...result });
  }
  // Ein Verein ohne eigene Mail ist kein Ausfall des Cron-Jobs.
  const failed = results.filter(
    (item) =>
      !item.ok &&
      (!("reason" in item) || item.reason !== "not_configured"),
  );
  return Response.json(
    { ok: failed.length === 0, results },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
