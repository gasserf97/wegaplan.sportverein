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

type ParsedClubEvent = {
  body: string;
  startsAt: Date;
  endsAt: Date;
  audienceAll: boolean;
  audienceAdmins: boolean;
  audienceClub: boolean;
  sections: { id: string }[];
};

async function parseClubEventForm(
  formData: FormData,
  options: { hasImage: boolean },
): Promise<{ ok: true; value: ParsedClubEvent } | { ok: false; state: ClubEventFormState }> {
  const draft = draftFromForm(formData);
  const parsedBody = bodySchema.safeParse(draft.body);
  if (!parsedBody.success) {
    return {
      ok: false,
      state: formError(
        parsedBody.error.issues[0]?.message ?? "Bitte einen Text schreiben.",
        formData,
      ),
    };
  }
  if (!parsedBody.data && !options.hasImage) {
    return {
      ok: false,
      state: formError("Bitte einen Text schreiben oder ein Bild auswählen.", formData),
    };
  }

  const startsAt = clubDayStart(draft.startsOn.trim());
  const endsAt = clubDayEnd(draft.endsOn.trim());
  if (!startsAt || !endsAt) {
    return {
      ok: false,
      state: formError(
        "Bitte Beginn und Ende des Veröffentlichungszeitraums angeben.",
        formData,
      ),
    };
  }
  if (endsAt < startsAt) {
    return {
      ok: false,
      state: formError("Das Ende liegt vor dem Beginn.", formData),
    };
  }

  const sectionIds = [...new Set(draft.sectionIds)];
  if (
    !draft.audienceAll &&
    !draft.audienceAdmins &&
    !draft.audienceClub &&
    sectionIds.length === 0
  ) {
    return {
      ok: false,
      state: formError("Bitte mindestens eine Gruppe auswählen.", formData),
    };
  }

  const sections = sectionIds.length
    ? await prisma.section.findMany({
        where: { id: { in: sectionIds } },
        select: { id: true },
      })
    : [];
  if (sections.length !== sectionIds.length) {
    return {
      ok: false,
      state: formError("Eine gewählte Sektion gibt es nicht mehr.", formData),
    };
  }

  return {
    ok: true,
    value: {
      body: parsedBody.data,
      startsAt,
      endsAt,
      audienceAll: draft.audienceAll,
      audienceAdmins: draft.audienceAdmins,
      audienceClub: draft.audienceClub,
      sections,
    },
  };
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

  const image = imageFromForm(formData);
  const parsed = await parseClubEventForm(formData, { hasImage: Boolean(image) });
  if (!parsed.ok) return parsed.state;

  let savedImage: { storageKey: string; mimeType: string } | null = null;
  if (image) {
    const saved = await saveClubEventImage(image);
    if (!saved.ok) return formError(saved.error, formData);
    savedImage = saved;
  }

  try {
    const event = await prisma.clubEvent.create({
      data: {
        body: parsed.value.body,
        startsAt: parsed.value.startsAt,
        endsAt: parsed.value.endsAt,
        audienceAll: parsed.value.audienceAll,
        audienceAdmins: parsed.value.audienceAdmins,
        audienceClub: parsed.value.audienceClub,
        imageStorageKey: savedImage?.storageKey,
        imageMimeType: savedImage?.mimeType,
        createdById: admin.id,
        sections: {
          create: parsed.value.sections.map((section) => ({ sectionId: section.id })),
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

export async function updateClubEventAction(
  _prev: ClubEventFormState,
  formData: FormData,
): Promise<ClubEventFormState> {
  const admin = await requireAdmin();
  if (!admin) return formError("Nur Haupt-Administratoren.", formData);

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return formError("Hinweis nicht gefunden.", formData);

  const existing = await prisma.clubEvent.findUnique({
    where: { id: eventId },
    select: { id: true, imageStorageKey: true },
  });
  if (!existing) return formError("Dieser Hinweis wurde bereits gelöscht.", formData);

  const image = imageFromForm(formData);
  const removeImage = formChecked(formData, "removeImage");
  const keepsExistingImage = Boolean(existing.imageStorageKey) && !removeImage && !image;
  const parsed = await parseClubEventForm(formData, {
    hasImage: Boolean(image) || keepsExistingImage,
  });
  if (!parsed.ok) return parsed.state;

  let savedImage: { storageKey: string; mimeType: string } | null = null;
  if (image) {
    const saved = await saveClubEventImage(image);
    if (!saved.ok) return formError(saved.error, formData);
    savedImage = saved;
  }

  try {
    await prisma.clubEvent.update({
      where: { id: eventId },
      data: {
        body: parsed.value.body,
        startsAt: parsed.value.startsAt,
        endsAt: parsed.value.endsAt,
        audienceAll: parsed.value.audienceAll,
        audienceAdmins: parsed.value.audienceAdmins,
        audienceClub: parsed.value.audienceClub,
        ...(savedImage
          ? {
              imageStorageKey: savedImage.storageKey,
              imageMimeType: savedImage.mimeType,
            }
          : removeImage
            ? { imageStorageKey: null, imageMimeType: null }
            : {}),
        sections: {
          deleteMany: {},
          create: parsed.value.sections.map((section) => ({ sectionId: section.id })),
        },
        reads: { deleteMany: {} },
      },
    });

    const previousKey = existing.imageStorageKey;
    if (previousKey && (savedImage || removeImage)) {
      await deleteStoredFile(previousKey);
    }
    refreshEventSurfaces();
    return { ok: true, id: eventId };
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
