import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClubEventImageForViewer } from "@/lib/club-events";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  const { eventId } = await context.params;
  const image = await getClubEventImageForViewer(user, eventId);
  if (!image) {
    return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
  }

  try {
    const file = await readStoredFile(image.storageKey);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
  }
}
