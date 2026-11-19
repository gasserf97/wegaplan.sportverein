"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getCurrentClubRecord } from "@/lib/club-settings";
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

  const club = await getCurrentClubRecord();
  if (!club) return { error: "Kein Verein im Kontext." };

  const existingKey = club.settings?.logoStorageKey?.trim() ?? "";
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "remove") {
    await prisma.clubSettings.upsert({
      where: { clubId: club.id },
      create: { clubId: club.id, logoStorageKey: "", logoMimeType: "" },
      update: { logoStorageKey: "", logoMimeType: "" },
    });
    if (existingKey) await deleteStoredFile(existingKey);
    revalidateClubLogo();
    return { ok: true };
  }

  const file = logoFileFromForm(formData);
  if (!file) return { error: "Bitte ein Logo auswählen." };

  const saved = await saveClubLogo(club.id, file);
  if (!saved.ok) return { error: saved.error };

  try {
    await prisma.clubSettings.upsert({
      where: { clubId: club.id },
      create: {
        clubId: club.id,
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

  if (existingKey && existingKey !== saved.storageKey) {
    await deleteStoredFile(existingKey);
  }
  revalidateClubLogo();
  return { ok: true };
}
