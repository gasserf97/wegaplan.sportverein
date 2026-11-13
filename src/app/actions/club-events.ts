"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { clubDayEnd, clubDayStart } from "@/lib/club-events";
import { formChecked, formText } from "@/lib/form-draft";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, saveClubEventImage } from "@/lib/uploads";

export type ClubEventDraft = {
  body: string;
  startsOn: string;
  endsOn: string;
  audienceAll: boolean;
  audienceAdmins: boolean;
  audienceClub: boolean;
  sectionIds: string[];
};

export type ClubEventFormState =
  | { error: string; fields: ClubEventDraft }
  | { ok: true; id: string }
  | null;

const bodySchema = z
  .string()
  .trim()
  .max(4000, { error: "Der Text ist zu lang (höchstens 4000 Zeichen)." });

function imageFromForm(formData: FormData) {
  const value = formData.get("image");
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

function draftFromForm(formData: FormData): ClubEventDraft {
  return {
    body: formText(formData, "body"),
    startsOn: formText(formData, "startsOn"),
    endsOn: formText(formData, "endsOn"),
    audienceAll: formChecked(formData, "audienceAll"),
    audienceAdmins: formChecked(formData, "audienceAdmins"),
    audienceClub: formChecked(formData, "audienceClub"),
    sectionIds: formData
      .getAll("sectionIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
  };
}

function formError(error: string, formData: FormData): ClubEventFormState {
  return { error, fields: draftFromForm(formData) };
}

function refreshEventSurfaces() {
  revalidatePath("/admin/events");
  revalidatePath("/", "layout");
}

export async function createClubEventAction(
  _prev: ClubEventFormState,
  formData: FormData,
): Promise<ClubEventFormState> {
  const admin = await requireAdmin();
  if (!admin) return formError("Nur Haupt-Administratoren.", formData);

  const draft = draftFromForm(formData);
  const image = imageFromForm(formData);
  const parsedBody = bodySchema.safeParse(draft.body);
  if (!parsedBody.success) {
    return formError(
      parsedBody.error.issues[0]?.message ?? "Bitte einen Text schreiben.",
      formData,
    );
  }
  if (!parsedBody.data && !image) {
    return formError("Bitte einen Text schreiben oder ein Bild auswählen.", formData);
  }

  const startsAt = clubDayStart(draft.startsOn.trim());
  const endsAt = clubDayEnd(draft.endsOn.trim());
  if (!startsAt || !endsAt) {
    return formError("Bitte Beginn und Ende des Veröffentlichungszeitraums angeben.", formData);
  }
  if (endsAt < startsAt) {
    return formError("Das Ende liegt vor dem Beginn.", formData);
  }

  const sectionIds = [...new Set(draft.sectionIds)];
  if (
    !draft.audienceAll &&
    !draft.audienceAdmins &&
    !draft.audienceClub &&
    sectionIds.length === 0
  ) {
    return formError("Bitte mindestens eine Gruppe auswählen.", formData);
  }

  const sections = sectionIds.length
    ? await prisma.section.findMany({
        where: { id: { in: sectionIds } },
        select: { id: true },
      })
    : [];
  if (sections.length !== sectionIds.length) {
    return formError("Eine gewählte Sektion gibt es nicht mehr.", formData);
  }

  let savedImage: { storageKey: string; mimeType: string } | null = null;
  if (image) {
    const saved = await saveClubEventImage(image);
    if (!saved.ok) return formError(saved.error, formData);
    savedImage = saved;
  }

  try {
    const event = await prisma.clubEvent.create({
      data: {
        body: parsedBody.data,
        startsAt,
        endsAt,
        audienceAll: draft.audienceAll,
        audienceAdmins: draft.audienceAdmins,
        audienceClub: draft.audienceClub,
        imageStorageKey: savedImage?.storageKey,
        imageMimeType: savedImage?.mimeType,
        createdById: admin.id,
        sections: {
          create: sections.map((section) => ({ sectionId: section.id })),
        },
      },
      select: { id: true },
    });

    refreshEventSurfaces();
    return { ok: true, id: event.id };
  } catch {
    if (savedImage) await deleteStoredFile(savedImage.storageKey);
    return formError(
      "Der Hinweis konnte nicht gespeichert werden. Bitte erneut versuchen.",
      formData,
    );
  }
}

export async function deleteClubEventAction(
  eventId: string,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const existing = await prisma.clubEvent.findUnique({
    where: { id: eventId },
    select: { id: true, imageStorageKey: true },
  });
  if (!existing) return { error: "Dieser Hinweis wurde bereits gelöscht." };

  await prisma.clubEvent.delete({ where: { id: eventId } });
  if (existing.imageStorageKey) {
    await deleteStoredFile(existing.imageStorageKey);
  }
  refreshEventSurfaces();
  return { ok: true };
}

export async function markClubEventReadAction(
  _prev: { ok: true } | { error: string } | null,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Bitte anmelden." };

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return { error: "Hinweis nicht gefunden." };

  const existing = await prisma.clubEvent.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!existing) return { error: "Hinweis nicht gefunden." };

  await prisma.clubEventRead.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: { eventId, userId: user.id },
    update: {},
  });

  refreshEventSurfaces();
  return { ok: true };
}
