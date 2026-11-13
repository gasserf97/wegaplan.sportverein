import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canActFor } from "@/lib/family";
import { buildMembershipCardData } from "@/lib/membership-card-data";
import {
  buildMembershipCardPdf,
  membershipCardPdfFilename,
} from "@/lib/membership-card-pdf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bitte melden Sie sich an." }, { status: 401 });
  }

  const { subscriptionId } = await context.params;
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      user: { select: { id: true, name: true, birthDate: true } },
    },
  });
  if (
    !subscription ||
    (subscription.status !== "ACTIVE" &&
      subscription.status !== "SCHEDULED") ||
    subscription.plan.kind !== "MEMBERSHIP"
  ) {
    return NextResponse.json(
      { error: "Vereinsmitgliedschaft nicht gefunden." },
      { status: 404 },
    );
  }

  const allowed =
    user.role === "ADMIN" ||
    subscription.purchasedById === user.id ||
    (await canActFor(user.id, subscription.userId));
  if (!allowed) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const pdf = await buildMembershipCardPdf(
    buildMembershipCardData({
      userId: subscription.user.id,
      name: subscription.user.name,
      birthDate: subscription.user.birthDate,
      planTitle: subscription.plan.title,
      confirmationTitle: subscription.plan.confirmationTitle,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      interval: subscription.plan.interval,
    }),
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${membershipCardPdfFilename(subscription.user.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
