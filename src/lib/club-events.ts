import { CLUB_TIMEZONE } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { currentlyValidSubscriptionFilter } from "@/lib/subscriptions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function timeZoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Einige Engines schreiben Mitternacht als Stunde 24.
  const hour = value("hour") === 24 ? 0 : value("hour");
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    hour,
    value("minute"),
    value("second"),
  );
  return asUtc - instant.getTime();
}

/** Kalendertag Europe/Rome als UTC-Zeitpunkt (Tagesbeginn). */
export function clubDayStart(isoDate: string): Date | null {
  if (!ISO_DATE.test(isoDate)) return null;
  const utcMidnight = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight.getTime())) return null;
  const offset = timeZoneOffsetMs(utcMidnight, CLUB_TIMEZONE);
  const start = new Date(utcMidnight.getTime() - offset);
  const offsetAtStart = timeZoneOffsetMs(start, CLUB_TIMEZONE);
  if (offsetAtStart !== offset) {
    return new Date(utcMidnight.getTime() - offsetAtStart);
  }
  return start;
}

/** Ende des Kalendertags Europe/Rome (inklusive). */
export function clubDayEnd(isoDate: string): Date | null {
  if (!ISO_DATE.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextIso = next.toISOString().slice(0, 10);
  const nextStart = clubDayStart(nextIso);
  if (!nextStart) return null;
  return new Date(nextStart.getTime() - 1);
}

export type ClubEventPhase = "upcoming" | "live" | "past";

export function clubEventPhase(
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
): ClubEventPhase {
  if (now < startsAt) return "upcoming";
  if (now > endsAt) return "past";
  return "live";
}

async function getUserEventAudience(userId: string) {
  const self = await prisma.user.findUnique({
    where: { id: userId },
    select: { managedById: true, role: true },
  });
  const rootId = self?.managedById ?? userId;
  const subscriptions = await prisma.subscription.findMany({
    where: {
      user: {
        OR: [{ id: rootId }, { managedById: rootId }],
      },
      ...currentlyValidSubscriptionFilter(),
    },
    select: {
      plan: { select: { kind: true, sectionId: true } },
    },
  });

  const sectionIds = [
    ...new Set(
      subscriptions
        .filter((item) => item.plan.kind === "ADDON" && item.plan.sectionId)
        .map((item) => item.plan.sectionId as string),
    ),
  ];

  return {
    isAdmin: self?.role === "ADMIN",
    hasClub: subscriptions.some((item) => item.plan.kind === "MEMBERSHIP"),
    sectionIds,
  };
}

/** Aktive Hinweise, die dieser Nutzer noch nicht als gelesen markiert hat. */
export async function listVisibleClubEvents(userId: string) {
  const now = new Date();
  const audience = await getUserEventAudience(userId);

  return prisma.clubEvent.findMany({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
      reads: { none: { userId } },
      OR: [
        { audienceAll: true },
        ...(audience.isAdmin ? [{ audienceAdmins: true }] : []),
        ...(audience.hasClub ? [{ audienceClub: true }] : []),
        ...(audience.sectionIds.length > 0
          ? [{ sections: { some: { sectionId: { in: audience.sectionIds } } } }]
          : []),
      ],
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, body: true, imageStorageKey: true },
  });
}

const EVENT_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Bild nur für Haupt-Admins oder für die Zielgruppe im Veröffentlichungszeitraum. */
export async function getClubEventImageForViewer(
  user: { id: string; role: "USER" | "ADMIN" },
  eventId: string,
) {
  const event = await prisma.clubEvent.findUnique({
    where: { id: eventId },
    select: {
      imageStorageKey: true,
      imageMimeType: true,
      startsAt: true,
      endsAt: true,
      audienceAll: true,
      audienceClub: true,
      sections: { select: { sectionId: true } },
    },
  });
  if (!event?.imageStorageKey || !event.imageMimeType) return null;
  if (!EVENT_IMAGE_MIME.has(event.imageMimeType)) return null;

  if (user.role !== "ADMIN") {
    const now = new Date();
    if (now < event.startsAt || now > event.endsAt) return null;
    const audience = await getUserEventAudience(user.id);
    const sectionIds = new Set(event.sections.map((item) => item.sectionId));
    const matches =
      event.audienceAll ||
      (event.audienceClub && audience.hasClub) ||
      audience.sectionIds.some((sectionId) => sectionIds.has(sectionId));
    if (!matches) return null;
  }

  return {
    storageKey: event.imageStorageKey,
    mimeType: event.imageMimeType,
  };
}
