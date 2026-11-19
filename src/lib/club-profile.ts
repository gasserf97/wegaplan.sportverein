import { getCurrentClubRecord } from "@/lib/club-settings";
import { readStoredFile } from "@/lib/uploads";

const LOGO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function getClubProfile() {
  const club = await getCurrentClubRecord();
  return club?.settings ?? null;
}

/** Öffentliche URL, nur wenn dieser Verein ein eigenes Logo hat. `v` wechselt mit der Datei. */
export function clubLogoUrl(
  settings: { logoStorageKey: string | null } | null | undefined,
) {
  const key = settings?.logoStorageKey?.trim() ?? "";
  if (!key) return null;
  const file = key.split("/").pop() ?? "logo";
  const version = file.replace(/\.[^.]+$/, "");
  return `/api/club/logo?v=${encodeURIComponent(version)}`;
}

export function isClubLogoMime(mimeType: string | null | undefined) {
  return Boolean(mimeType && LOGO_MIME.has(mimeType));
}

export async function readClubLogoBytes() {
  const settings = await getClubProfile();
  const key = settings?.logoStorageKey?.trim() ?? "";
  if (!key || !isClubLogoMime(settings?.logoMimeType)) return null;
  try {
    return await readStoredFile(key);
  } catch {
    return null;
  }
}
