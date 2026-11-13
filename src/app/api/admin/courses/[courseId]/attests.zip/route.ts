import { NextResponse } from "next/server";
import { requireCourseManager } from "@/lib/auth";
import {
  buildCourseDocumentsZip,
  contentDispositionAttachment,
} from "@/lib/course-export";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/** Alias auf denselben Dokumente-ZIP-Export (Rückwärtskompatibilität). */
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

    const zip = await buildCourseDocumentsZip(courseId);
    if (!zip) {
      return NextResponse.json(
        { error: "Kurs nicht gefunden." },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(zip.buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDispositionAttachment(zip.filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Course attests zip failed", error);
    const message =
      error instanceof Error ? error.message : "Unbekannter Exportfehler.";
    return NextResponse.json(
      { error: `Export fehlgeschlagen: ${message}` },
      { status: 500 },
    );
  }
}
