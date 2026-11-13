import { NextResponse } from "next/server";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { buildEnrollmentConfirmationPdf } from "@/lib/booking-confirmation";
import { canActFor } from "@/lib/family";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bitte melden Sie sich an." }, { status: 401 });
  }

  const { enrollmentId } = await context.params;
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true },
  });
  if (!enrollment || enrollment.status !== "PAID") {
    return NextResponse.json(
      { error: "Keine bezahlte Kursbuchung gefunden." },
      { status: 404 },
    );
  }

  const manager = await requireCourseManager();
  const allowed =
    (manager != null && (await canManageCourse(manager.id, enrollment.course))) ||
    enrollment.purchasedById === user.id ||
    (await canActFor(user.id, enrollment.userId));
  if (!allowed) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const file = await buildEnrollmentConfirmationPdf(enrollmentId);
  if (!file) {
    return NextResponse.json(
      { error: "Keine bezahlte Kursbuchung gefunden." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
