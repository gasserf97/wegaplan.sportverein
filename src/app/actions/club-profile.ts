"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CLUB_PROFILE_ID } from "@/lib/club-profile";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, saveClubLogo } from "@/lib/uploads";

export type ClubLogoState = { error: string } | { ok: true } | null;

function revalidateClubLogo() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/sektionen");
}

function logoFileFromForm(formData: FormData) {
  const value = formData.get("logo");
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

export async function updateClubLogoAction(
  _prev: ClubLogoState,
  formData: FormData,
): Promise<ClubLogoState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const existing = await prisma.clubProfile.findUnique({
    where: { id: CLUB_PROFILE_ID },
    select: { logoStorageKey: true },
  });
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "remove") {
    if (existing) {
      await prisma.clubProfile.update({
        where: { id: CLUB_PROFILE_ID },
        data: { logoStorageKey: null, logoMimeType: null },
      });
      if (existing.logoStorageKey) await deleteStoredFile(existing.logoStorageKey);
    }
    revalidateClubLogo();
    return { ok: true };
  }

  const file = logoFileFromForm(formData);
  if (!file) return { error: "Bitte ein Logo auswählen." };

  const saved = await saveClubLogo(file);
  if (!saved.ok) return { error: saved.error };

  try {
    await prisma.clubProfile.upsert({
      where: { id: CLUB_PROFILE_ID },
      create: {
        id: CLUB_PROFILE_ID,
        logoStorageKey: saved.storageKey,
        logoMimeType: saved.mimeType,
      },
      update: {
        logoStorageKey: saved.storageKey,
        logoMimeType: saved.mimeType,
      },
    });
  } catch (error) {
    await deleteStoredFile(saved.storageKey);
    throw error;
  }

  if (existing?.logoStorageKey && existing.logoStorageKey !== saved.storageKey) {
    await deleteStoredFile(existing.logoStorageKey);
  }
  revalidateClubLogo();
  return { ok: true };
}
