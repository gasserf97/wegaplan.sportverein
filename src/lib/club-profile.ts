import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";

export const CLUB_PROFILE_ID = "default";

const LOGO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function getClubProfile() {
  return prisma.clubProfile.findUnique({ where: { id: CLUB_PROFILE_ID } });
}

/** Öffentliche URL, nur wenn ein eigenes Logo hinterlegt ist. `v` wechselt mit der Datei. */
export function clubLogoUrl(
  profile: { logoStorageKey: string | null } | null | undefined,
) {
  if (!profile?.logoStorageKey) return null;
  const file = profile.logoStorageKey.split("/").pop() ?? "logo";
  const version = file.replace(/\.[^.]+$/, "");
  return `/api/club/logo?v=${encodeURIComponent(version)}`;
}

export function isClubLogoMime(mimeType: string | null | undefined) {
  return Boolean(mimeType && LOGO_MIME.has(mimeType));
}

export async function readClubLogoBytes() {
  const profile = await getClubProfile();
  if (!profile?.logoStorageKey || !isClubLogoMime(profile.logoMimeType)) {
    return null;
  }
  try {
    return await readStoredFile(profile.logoStorageKey);
  } catch {
    return null;
  }
}
