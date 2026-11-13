import { NextResponse } from "next/server";
import type { EnrollmentDocumentKind } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { uploadEnrollmentDocument } from "@/lib/medical-certificate-upload";

export const runtime = "nodejs";

const VALID_KINDS = new Set<EnrollmentDocumentKind>([
  "MEDICAL_CERTIFICATE",
  "PASSPORT_PHOTO",
  "ID_FRONT",
  "ID_BACK",
  "HEALTH_CARD",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bitte melden Sie sich an." }, { status: 401 });
  }

  const { enrollmentId } = await context.params;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Die Datei konnte nicht gelesen werden (evtl. zu groß)." },
      { status: 413 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Bitte eine Datei auswählen." }, { status: 400 });
  }

  const kindRaw = String(formData.get("kind") ?? "").trim();
  const kind = kindRaw as EnrollmentDocumentKind;
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "Ungültiger Dokumenttyp." }, { status: 400 });
  }

  const result = await uploadEnrollmentDocument(
    enrollmentId,
    user.id,
    file,
    kind,
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
