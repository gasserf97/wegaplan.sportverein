import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { beginClubStripeOnboarding } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string }> },
) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId } = await params;
  const result = await beginClubStripeOnboarding(clubId);
  if ("url" in result) redirect(result.url);
  const query = new URLSearchParams({ stripe: result.code });
  if (result.detail) query.set("m", result.detail);
  redirect(`/vereine/${clubId}?${query.toString()}`);
}
