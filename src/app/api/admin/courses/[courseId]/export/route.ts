import { NextResponse } from "next/server";
import { requireCourseManager } from "@/lib/auth";
import {
  buildCourseEnrollmentsWorkbook,
  buildCourseFullExportZip,
  contentDispositionAttachment,
  XLSX_CONTENT_TYPE,
} from "@/lib/course-export";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  try {
    const manager = await requireCourseManager();
    if (!manager) {
      return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
    }

    const { courseId } = await context.params;
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course || !(await canManageCourse(manager.id, course))) {
      return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
    }

    const full = await buildCourseFullExportZip(courseId);
    if (!full) {
      return NextResponse.json(
        { error: "Kurs nicht gefunden." },
        { status: 404 },
      );
    }

    if (full.hasDocumentRequirements || full.fileCount > 0) {
      return new NextResponse(new Uint8Array(full.buffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": contentDispositionAttachment(full.filename),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const workbook = await buildCourseEnrollmentsWorkbook(courseId);
    if (!workbook) {
      return NextResponse.json(
        { error: "Kurs nicht gefunden." },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(workbook.buffer), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": contentDispositionAttachment(workbook.filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Course export failed", error);
    const message =
      error instanceof Error ? error.message : "Unbekannter Exportfehler.";
    return NextResponse.json(
      { error: `Export fehlgeschlagen: ${message}` },
      { status: 500 },
    );
  }
}
