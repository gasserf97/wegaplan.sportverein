import { NextResponse } from "next/server";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { beginSectionStripeOnboarding } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubId: string; sectionId: string }> },
) {
  const admin = await getPlatformAdmin();
  const { clubId, sectionId } = await params;
  if (!admin) {
    return NextResponse.redirect(new URL("/vereine", request.url));
  }
  const result = await beginSectionStripeOnboarding(sectionId);
  if ("url" in result) {
    // 303: einmaliger Stripe-Link darf nicht durch erneutes POST/Prefetch verbraucht werden.
    return NextResponse.redirect(result.url, 303);
  }
  const target = new URL(`/vereine/${clubId}`, request.url);
  target.searchParams.set("stripe", result.code);
  target.searchParams.set("section", sectionId);
  if (result.detail) target.searchParams.set("m", result.detail);
  target.hash = `section-${sectionId}`;
  return NextResponse.redirect(target);
}
