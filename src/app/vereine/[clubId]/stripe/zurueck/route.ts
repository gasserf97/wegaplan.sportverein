import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { refreshClubConnectStatus } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string }> },
) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId } = await params;
  try {
    await refreshClubConnectStatus(clubId);
  } catch (error) {
    console.error("Stripe Connect Rückkehr", clubId, error);
    redirect(
      `/vereine/${clubId}?stripe=stripe&m=${encodeURIComponent("Status konnte nicht geladen werden.")}`,
    );
  }
  redirect(`/vereine/${clubId}?stripe=zurueck`);
}
