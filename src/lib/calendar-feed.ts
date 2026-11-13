import { ASC_CLUB } from "@/lib/brand";
import { courseSessionOccurrences, formatCourseSchedule } from "@/lib/course-schedule";
import { isActiveCourseEnrollment } from "@/lib/courses";
import { ageFromBirthDate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

const FEED_NAME = "ASC Lajen";
const PAST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type CalendarFeedEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

export function calendarFeedPath(token: string) {
  return `/api/kalender/${token}`;
}

/** Accepts `/api/kalender/<token>` and `/api/kalender/<token>.ics`. */
export function calendarTokenFromParam(param: string) {
  const token = param.replace(/\.ics$/i, "");
  return isCalendarFeedToken(token) ? token : null;
}

export function calendarFeedUrls(appUrl: string, token: string) {
  const base = appUrl.replace(/\/+$/, "");
  const httpsUrl = `${base}${calendarFeedPath(token)}`;
  const webcalUrl = httpsUrl.replace(/^https:/i, "webcal:").replace(/^http:/i, "webcal:");
  // Stand 18.10.: /calendar/r mit webcal-cid; Android öffnet das in Chrome.
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  return { httpsUrl, webcalUrl, googleUrl };
}

export function isCalendarFeedToken(token: string) {
  return /^[A-Za-z0-9_-]{20,128}$/.test(token);
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545: fold at 75 octets. Continuation lines start with a space. */
function foldLine(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let width = 75;
  while (start < bytes.length) {
    let end = Math.min(start + width, bytes.length);
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }
    if (end <= start) end = Math.min(start + width, bytes.length);
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    width = 74;
  }
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

export function buildCalendarIcs(
  events: CalendarFeedEvent[],
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ASC Lajen//Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(FEED_NAME)}`,
    "X-WR-TIMEZONE:Europe/Rome",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@asclajen.calendar`,
      "CLASS:PUBLIC",
      `DTSTAMP:${icsUtc(now)}`,
      `DTSTART:${icsUtc(event.startsAt)}`,
      `DTEND:${icsUtc(event.endsAt)}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `LOCATION:${icsEscape(event.location)}`,
      `DESCRIPTION:${icsEscape(event.description)}`,
      `CREATED:${icsUtc(event.createdAt)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export async function loadCourtCalendarEvents(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - PAST_WINDOW_MS);
  const reservations = await prisma.courtReservation.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      endsAt: { gte: since },
    },
    include: {
      court: { select: { name: true, category: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const locationBase = `${ASC_CLUB.street}, ${ASC_CLUB.postalCode} ${ASC_CLUB.city}`;

  return reservations.map((reservation): CalendarFeedEvent => {
    const details = [
      reservation.court.category,
      reservation.partnerName ? `Partner: ${reservation.partnerName}` : "",
    ].filter(Boolean);
    return {
      id: reservation.id,
      title: `Tennis · ${reservation.court.name}`,
      description: details.join("\n") || "Tennisplatz-Reservierung",
      location: `${reservation.court.name}, ${locationBase}`,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      createdAt: reservation.createdAt,
    };
  });
}

export async function loadCourseCalendarEvents(
  userId: string,
  options: { includeSelf: boolean; includeChildren: boolean },
  now = new Date(),
) {
  if (!options.includeSelf && !options.includeChildren) return [];

  const self = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, managedById: true },
  });
  if (!self) return [];

  const rootId = self.managedById ?? self.id;
  const members = await prisma.user.findMany({
    where: { OR: [{ id: rootId }, { managedById: rootId }] },
    select: { id: true, name: true, birthDate: true },
  });
  const includedIds = members
    .filter((member) => {
      if (member.id === userId) return options.includeSelf;
      return options.includeChildren && ageFromBirthDate(member.birthDate, now) < 18;
    })
    .map((member) => member.id);
  if (includedIds.length === 0) return [];

  const nameById = new Map(members.map((member) => [member.id, member.name]));

  const enrollments = await prisma.enrollment.findMany({
    where: {
      userId: { in: includedIds },
      status: { in: ["PAID", "PENDING"] },
    },
    include: {
      course: {
        select: {
          title: true,
          location: true,
          scheduleWeekdays: true,
          scheduleStartMinute: true,
          scheduleEndMinute: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });

  const locationBase = `${ASC_CLUB.street}, ${ASC_CLUB.postalCode} ${ASC_CLUB.city}`;
  const events: CalendarFeedEvent[] = [];

  for (const enrollment of enrollments) {
    if (!isActiveCourseEnrollment(enrollment, false, now)) continue;
    const sessions = courseSessionOccurrences(enrollment.course, now);
    const participant = nameById.get(enrollment.userId);
    const forSomeoneElse = enrollment.userId !== userId && participant;
    const scheduleLabel = formatCourseSchedule(
      enrollment.course.scheduleWeekdays,
      enrollment.course.scheduleStartMinute,
      enrollment.course.scheduleEndMinute,
      "de",
    );
    for (const session of sessions) {
      events.push({
        id: `course-${enrollment.id}-${session.key}`,
        title: forSomeoneElse
          ? `${enrollment.course.title} · ${participant}`
          : enrollment.course.title,
        description: scheduleLabel ?? "Kurs",
        location: enrollment.course.location || locationBase,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        createdAt: enrollment.createdAt,
      });
    }
  }

  return events;
}
