import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { beginSectionStripeOnboarding } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; sectionId: string }> },
) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId, sectionId } = await params;
  const result = await beginSectionStripeOnboarding(sectionId);
  if ("url" in result) redirect(result.url);
  const query = new URLSearchParams({ stripe: result.code, section: sectionId });
  if (result.detail) query.set("m", result.detail);
  redirect(`/vereine/${clubId}?${query.toString()}#section-${sectionId}`);
}
