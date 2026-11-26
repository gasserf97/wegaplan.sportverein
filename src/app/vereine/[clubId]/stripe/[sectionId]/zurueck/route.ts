import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { refreshSectionConnectStatus } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; sectionId: string }> },
) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId, sectionId } = await params;
  try {
    await refreshSectionConnectStatus(sectionId);
  } catch (error) {
    console.error("Stripe Connect Rückkehr", sectionId, error);
    redirect(
      `/vereine/${clubId}?stripe=stripe&section=${sectionId}&m=${encodeURIComponent("Status konnte nicht geladen werden.")}#section-${sectionId}`,
    );
  }
  redirect(`/vereine/${clubId}?stripe=zurueck&section=${sectionId}#section-${sectionId}`);
}
