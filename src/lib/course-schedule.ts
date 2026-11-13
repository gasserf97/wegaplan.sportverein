import type { Locale } from "@/lib/i18n/types";
import { CLUB_TIMEZONE } from "@/lib/format";

const WEEKDAY_LABELS: Record<Locale, Record<number, string>> = {
  de: {
    1: "Montags",
    2: "Dienstags",
    3: "Mittwochs",
    4: "Donnerstags",
    5: "Freitags",
    6: "Samstags",
    7: "Sonntags",
  },
  it: {
    1: "lunedì",
    2: "martedì",
    3: "mercoledì",
    4: "giovedì",
    5: "venerdì",
    6: "sabato",
    7: "domenica",
  },
};

export function formatClock(minute: number | null | undefined) {
  if (minute == null || minute < 0 || minute >= 24 * 60) return "";
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatCourseSchedule(
  weekdays: number[] | null | undefined,
  startMinute: number | null | undefined,
  endMinute: number | null | undefined,
  locale: Locale = "de",
) {
  if (!weekdays?.length || startMinute == null || endMinute == null) return null;
  const labels = [...weekdays]
    .filter((day) => day >= 1 && day <= 7)
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[locale][day]);
  if (labels.length === 0) return null;
  const days = joinDayLabels(labels, locale);
  return `${days} ${formatClock(startMinute)}–${formatClock(endMinute)}`;
}

function joinDayLabels(labels: string[], locale: Locale) {
  if (labels.length === 1) return labels[0]!;
  const conjunction = locale === "it" ? "e" : "und";
  const rest =
    locale === "de"
      ? labels.slice(1).map((label) => label.charAt(0).toLowerCase() + label.slice(1))
      : labels.slice(1);
  if (rest.length === 1) return `${labels[0]} ${conjunction} ${rest[0]}`;
  return `${labels[0]}, ${rest.slice(0, -1).join(", ")} ${conjunction} ${rest[rest.length - 1]}`;
}

type CivilDate = { y: number; m: number; d: number };

function civilInZone(date: Date, timeZone: string): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { y: value("year"), m: value("month"), d: value("day") };
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const next = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return {
    y: next.getUTCFullYear(),
    m: next.getUTCMonth() + 1,
    d: next.getUTCDate(),
  };
}

function compareCivil(a: CivilDate, b: CivilDate) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function isoWeekday(date: CivilDate) {
  const day = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function zoneOffsetMs(instant: Date, timeZone: string) {
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
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const hour = value("hour") % 24;
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

/** Wandelt eine Ortszeit in Europe/Rome in einen UTC-Zeitpunkt um. */
export function romeLocalToUtc(date: CivilDate, minuteOfDay: number) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const guess = Date.UTC(date.y, date.m - 1, date.d, hours, minutes, 0);
  const offset = zoneOffsetMs(new Date(guess), CLUB_TIMEZONE);
  let utc = guess - offset;
  const offset2 = zoneOffsetMs(new Date(utc), CLUB_TIMEZONE);
  if (offset2 !== offset) utc = guess - offset2;
  return new Date(utc);
}

export type CourseOccurrence = {
  key: string;
  startsAt: Date;
  endsAt: Date;
};

const MAX_OCCURRENCES = 120;
const OPEN_ENDED_WEEKS = 40;
const MAX_UNIT_DAYS = 3660;

function asCourseDate(value: Date | string | null | undefined) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Kurs hat Start, Ende und feste Kurszeiten – geeignet für den Kalender-Feed. */
export function courseHasCalendarSchedule(course: {
  scheduleWeekdays?: number[] | null;
  scheduleStartMinute?: number | null;
  scheduleEndMinute?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}) {
  const startsAt = asCourseDate(course.startsAt);
  const endsAt = asCourseDate(course.endsAt);
  const weekdays = (course.scheduleWeekdays ?? []).filter(
    (day) => day >= 1 && day <= 7,
  );
  const startMinute = course.scheduleStartMinute;
  const endMinute = course.scheduleEndMinute;
  return Boolean(
    startsAt &&
      endsAt &&
      weekdays.length > 0 &&
      startMinute != null &&
      endMinute != null &&
      endMinute > startMinute,
  );
}

/** Kurseinheiten im Zeitraum: jeder passende Wochentag zwischen Start und Ende, einschließlich vergangener Stunden. */
export function countCourseUnits(course: {
  scheduleWeekdays: number[] | null | undefined;
  startsAt: Date | string | null | undefined;
  endsAt: Date | string | null | undefined;
}): number | null {
  const startsAt = asCourseDate(course.startsAt);
  const endsAt = asCourseDate(course.endsAt);
  if (!startsAt || !endsAt) return null;

  const weekdays = new Set(
    (course.scheduleWeekdays ?? []).filter((day) => day >= 1 && day <= 7),
  );
  if (weekdays.size === 0) return null;

  const courseStart = civilInZone(startsAt, CLUB_TIMEZONE);
  const courseEnd = civilInZone(endsAt, CLUB_TIMEZONE);
  if (compareCivil(courseStart, courseEnd) > 0) return null;

  let cursor = courseStart;
  let count = 0;
  let guard = 0;
  while (compareCivil(cursor, courseEnd) <= 0 && guard < MAX_UNIT_DAYS) {
    if (weekdays.has(isoWeekday(cursor))) count += 1;
    cursor = addCivilDays(cursor, 1);
    guard += 1;
  }

  return count > 0 ? count : null;
}

export function courseSessionOccurrences(
  course: {
    scheduleWeekdays: number[];
    scheduleStartMinute: number | null;
    scheduleEndMinute: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
  },
  now = new Date(),
): CourseOccurrence[] {
  const {
    scheduleWeekdays,
    scheduleStartMinute,
    scheduleEndMinute,
    startsAt,
    endsAt,
  } = course;
  if (
    scheduleWeekdays.length === 0 ||
    scheduleStartMinute == null ||
    scheduleEndMinute == null ||
    scheduleEndMinute <= scheduleStartMinute ||
    !startsAt
  ) {
    return [];
  }

  const weekdays = new Set(scheduleWeekdays);
  const courseStart = civilInZone(startsAt, CLUB_TIMEZONE);
  const courseEnd = endsAt
    ? civilInZone(endsAt, CLUB_TIMEZONE)
    : addCivilDays(courseStart, OPEN_ENDED_WEEKS * 7);
  const today = civilInZone(now, CLUB_TIMEZONE);
  let cursor = compareCivil(courseStart, today) > 0 ? courseStart : today;
  const occurrences: CourseOccurrence[] = [];

  while (compareCivil(cursor, courseEnd) <= 0 && occurrences.length < MAX_OCCURRENCES) {
    if (weekdays.has(isoWeekday(cursor))) {
      const starts = romeLocalToUtc(cursor, scheduleStartMinute);
      const ends = romeLocalToUtc(cursor, scheduleEndMinute);
      if (ends > now) {
        const key = `${cursor.y}${String(cursor.m).padStart(2, "0")}${String(cursor.d).padStart(2, "0")}`;
        occurrences.push({
          key,
          startsAt: starts,
          endsAt: ends,
        });
      }
    }
    cursor = addCivilDays(cursor, 1);
  }

  return occurrences;
}
