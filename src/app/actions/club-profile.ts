"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getCurrentClubRecord } from "@/lib/club-settings";
import { prisma } from "@/lib/prisma";
import { isHexColor } from "@/lib/club-brand";
import { deleteStoredFile, saveClubLogo, saveClubStamp } from "@/lib/uploads";

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

export async function updateClubStampAction(
  _prev: ClubLogoState,
  formData: FormData,
): Promise<ClubLogoState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const club = await getCurrentClubRecord();
  if (!club) return { error: "Kein Verein im Kontext." };

  const existingKey = club.settings?.stampStorageKey?.trim() ?? "";
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "remove") {
    await prisma.clubSettings.upsert({
      where: { clubId: club.id },
      create: { clubId: club.id, stampStorageKey: "", stampMimeType: "" },
      update: { stampStorageKey: "", stampMimeType: "" },
    });
    if (existingKey) await deleteStoredFile(existingKey);
    revalidateClubLogo();
    return { ok: true };
  }

  const value = formData.get("stamp");
  const file = value instanceof File && value.size > 0 ? value : null;
  if (!file) return { error: "Bitte einen Stempel auswählen." };

  const saved = await saveClubStamp(club.id, file);
  if (!saved.ok) return { error: saved.error };

  try {
    await prisma.clubSettings.upsert({
      where: { clubId: club.id },
      create: {
        clubId: club.id,
        stampStorageKey: saved.storageKey,
        stampMimeType: saved.mimeType,
      },
      update: {
        stampStorageKey: saved.storageKey,
        stampMimeType: saved.mimeType,
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

const BRAND_LIMITS = {
  letterName: 120,
  namePrimary: 80,
  nameSecondary: 80,
  president: 80,
  street: 120,
  postalCode: 12,
  city: 80,
  province: 8,
  taxId: 20,
  vatId: 20,
  legalForm: 120,
  tennisClubName: 120,
} as const;

function brandText(formData: FormData, name: keyof typeof BRAND_LIMITS) {
  return String(formData.get(name) ?? "").trim().slice(0, BRAND_LIMITS[name]);
}

function brandColor(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!isHexColor(value)) return null;
  return value.toLowerCase();
}

export async function updateClubBrandAction(
  _prev: ClubLogoState,
  formData: FormData,
): Promise<ClubLogoState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const club = await getCurrentClubRecord();
  if (!club) return { error: "Kein Verein im Kontext." };

  const colorPrimary = brandColor(formData, "colorPrimary");
  const colorCardStart = brandColor(formData, "colorCardStart");
  const colorCardMid = brandColor(formData, "colorCardMid");
  const colorCardEnd = brandColor(formData, "colorCardEnd");
  if (!colorPrimary || !colorCardStart || !colorCardMid || !colorCardEnd) {
    return { error: "Jede Farbe braucht einen Wert wie #e40000." };
  }

  const data = {
    letterName: brandText(formData, "letterName"),
    namePrimary: brandText(formData, "namePrimary"),
    nameSecondary: brandText(formData, "nameSecondary"),
    president: brandText(formData, "president"),
    street: brandText(formData, "street"),
    postalCode: brandText(formData, "postalCode"),
    city: brandText(formData, "city"),
    province: brandText(formData, "province"),
    taxId: brandText(formData, "taxId"),
    vatId: brandText(formData, "vatId"),
    legalForm: brandText(formData, "legalForm"),
    tennisClubName: brandText(formData, "tennisClubName"),
    colorPrimary,
    colorCardStart,
    colorCardMid,
    colorCardEnd,
  };

  await prisma.clubSettings.upsert({
    where: { clubId: club.id },
    create: { clubId: club.id, ...data },
    update: data,
  });
  revalidateClubLogo();
  revalidatePath("/datenschutz");
  revalidatePath("/konto");
  revalidatePath("/konto/mitgliedskarte");
  return { ok: true };
}
