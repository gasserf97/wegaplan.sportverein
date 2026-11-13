import { NextResponse } from "next/server";
import { requireCourseManager } from "@/lib/auth";
import { medicalCertificateDocument } from "@/lib/course-documents";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

export async function GET(
  _request: Request,
  context: { params: Promise<{ courseId: string; enrollmentId: string }> },
) {
  const manager = await requireCourseManager();
  if (!manager) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  const { courseId, enrollmentId } = await context.params;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !(await canManageCourse(manager.id, course))) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, courseId },
    include: { documents: true, user: { select: { name: true } } },
  });

  const medical = enrollment
    ? medicalCertificateDocument(enrollment.documents)
    : null;
  if (!medical) {
    return NextResponse.json({ error: "Kein Attest vorhanden." }, { status: 404 });
  }

  const file = await readStoredFile(medical.storageKey);
  const safeName = medical.originalName.replace(/[^\w.\-()äöüÄÖÜß ]+/g, "_");

  return new NextResponse(file, {
    headers: {
      "Content-Type": medical.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
