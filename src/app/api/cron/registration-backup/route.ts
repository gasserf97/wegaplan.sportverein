import { cronUnauthorizedResponse } from "@/lib/cron-auth";
import { sendRegistrationBackupEmail } from "@/lib/registration-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = cronUnauthorizedResponse(request);
  if (unauthorized) return unauthorized;

  const result = await sendRegistrationBackupEmail();
  if (!result.ok) {
    return Response.json({ ok: false, error: result.message }, { status: 500 });
  }
  return Response.json({
    ok: true,
    to: result.to,
    failed: result.failed,
    filename: result.filename,
    membersFilename: result.membersFilename,
    courses: result.courseCount,
    enrollments: result.enrollmentCount,
    plans: result.planCount,
    subscriptions: result.subscriptionCount,
    members: result.memberCount,
  });
}
