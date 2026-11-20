import { NextResponse } from "next/server";
import {
  getClubProfile,
  isClubLogoMime,
  readClubLogoBytes,
} from "@/lib/club-profile";
import { readPublicAsset } from "@/lib/public-asset";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getClubProfile();
  if (
    profile?.logoStorageKey &&
    isClubLogoMime(profile.logoMimeType) &&
    profile.logoMimeType
  ) {
    const file = await readClubLogoBytes();
    if (file) {
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": profile.logoMimeType,
          "Content-Disposition": "inline",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  const fallback = await readPublicAsset("asc-logo-icon.png", {
    bundledOnly: true,
  });
  if (!fallback) {
    return NextResponse.json({ error: "Logo nicht gefunden." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(fallback), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
