import { NextResponse } from "next/server";
import type { EnrollmentDocumentKind } from "@/generated/prisma/client";
import { requireCourseManager } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

const VALID_KINDS = new Set<EnrollmentDocumentKind>([
  "MEDICAL_CERTIFICATE",
  "PASSPORT_PHOTO",
  "ID_FRONT",
  "ID_BACK",
  "HEALTH_CARD",
]);

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      courseId: string;
      enrollmentId: string;
      kind: string;
    }>;
  },
) {
  const manager = await requireCourseManager();
  if (!manager) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  const { courseId, enrollmentId, kind: kindRaw } = await context.params;
  const kind = kindRaw as EnrollmentDocumentKind;
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "Ungültiger Dokumenttyp." }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !(await canManageCourse(manager.id, course))) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, courseId },
    include: {
      documents: { where: { kind } },
      user: { select: { name: true } },
    },
  });

  const doc = enrollment?.documents[0];
  if (!doc) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  const file = await readStoredFile(doc.storageKey);
  const safeName = doc.originalName.replace(/[^\w.\-()äöüÄÖÜß ]+/g, "_");
  const download = new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(file, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": download
        ? `attachment; filename="${safeName}"`
        : `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
