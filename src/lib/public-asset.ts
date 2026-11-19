import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentClubRecord } from "@/lib/club-settings";
import {
  getClubProfile,
  readClubLogoBytes,
  readClubStampBytes,
} from "@/lib/club-profile";
import { isLegacyClub } from "@/lib/tenant";

/**
 * Feste Pfade, damit Next.js beim Build nur diese Dateien traced
 * (kein dynamisches path.join(cwd, filename)).
 * Das Vereinszeichen nutzt ein hinterlegtes PNG oder JPG, sonst die Datei in public.
 */
export async function readPublicAsset(
  filename: "asc-logo-icon.png" | "asc-stamp-signature.jpg",
  options?: { bundledOnly?: boolean },
) {
  try {
    switch (filename) {
      case "asc-logo-icon.png": {
        if (!options?.bundledOnly) {
          const profile = await getClubProfile();
          if (
            profile?.logoMimeType === "image/png" ||
            profile?.logoMimeType === "image/jpeg"
          ) {
            const custom = await readClubLogoBytes();
            if (custom) return custom;
          }
        }
        return await fs.readFile(
          path.join(process.cwd(), "public/asc-logo-icon.png"),
        );
      }
      case "asc-stamp-signature.jpg": {
        if (!options?.bundledOnly) {
          const profile = await getClubProfile();
          if (
            profile?.stampMimeType === "image/png" ||
            profile?.stampMimeType === "image/jpeg"
          ) {
            const custom = await readClubStampBytes();
            if (custom) return custom;
          }
          const club = await getCurrentClubRecord();
          if (club && !isLegacyClub(club.slug)) return null;
        }
        return await fs.readFile(
          path.join(process.cwd(), "public/asc-stamp-signature.jpg"),
        );
      }
    }
  } catch {
    return null;
  }
}
