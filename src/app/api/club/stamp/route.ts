import { NextResponse } from "next/server";
import {
  getClubProfile,
  isClubLogoMime,
  readClubStampBytes,
} from "@/lib/club-profile";
import { getCurrentClubRecord } from "@/lib/club-settings";
import { readPublicAsset } from "@/lib/public-asset";
import { isLegacyClub } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getClubProfile();
  if (
    profile?.stampStorageKey &&
    isClubLogoMime(profile.stampMimeType) &&
    profile.stampMimeType
  ) {
    const file = await readClubStampBytes();
    if (file) {
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": profile.stampMimeType,
          "Content-Disposition": "inline",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  const club = await getCurrentClubRecord();
  if (club && !isLegacyClub(club.slug)) {
    return NextResponse.json({ error: "Stempel nicht gefunden." }, { status: 404 });
  }

  const fallback = await readPublicAsset("asc-stamp-signature.jpg", {
    bundledOnly: true,
  });
  if (!fallback) {
    return NextResponse.json({ error: "Stempel nicht gefunden." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(fallback), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
