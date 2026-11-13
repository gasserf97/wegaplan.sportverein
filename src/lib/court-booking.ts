import { addDays, reservationHours, startOfDay } from "@/lib/booking";
import { CLUB_TIMEZONE } from "@/lib/format";
import {
  CHECKOUT_HOLD_MINUTES,
  checkoutHoldSince,
} from "@/lib/checkout-hold";

/** ISO-Wochentag 1 = Montag … 7 = Sonntag. */
export function isoWeekday(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

const MAX_SERIES_OCCURRENCES = 60;

/**
 * Serientermine: Starttermin inkl., danach wöchentlich am gewählten Wochentag
 * bis einschließlich Enddatum (lokales Kalenderdatum).
 */
export function buildCourtSeriesOccurrences(
  startsAt: Date,
  endsAt: Date,
  untilDate: Date,
  weekday: number,
): Array<{ startsAt: Date; endsAt: Date }> {
  if (weekday < 1 || weekday > 7) return [];
  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs <= 0) return [];

  const until = startOfDay(untilDate);
  const firstDay = startOfDay(startsAt);
  if (until.getTime() < firstDay.getTime()) return [];

  const occurrences: Array<{ startsAt: Date; endsAt: Date }> = [];
  // Erster Termin ist immer der ausgewählte Slot.
  occurrences.push({ startsAt: new Date(startsAt), endsAt: new Date(endsAt) });

  let cursor = addDays(firstDay, 1);
  while (cursor.getTime() <= until.getTime() && occurrences.length < MAX_SERIES_OCCURRENCES) {
    if (isoWeekday(cursor) === weekday) {
      const nextStart = new Date(cursor);
      nextStart.setHours(
        startsAt.getHours(),
        startsAt.getMinutes(),
        startsAt.getSeconds(),
        startsAt.getMilliseconds(),
      );
      occurrences.push({
        startsAt: nextStart,
        endsAt: new Date(nextStart.getTime() + durationMs),
      });
    }
    cursor = addDays(cursor, 1);
  }

  return occurrences;
}

export function parseSeriesUntilDate(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return startOfDay(date);
}

export { CHECKOUT_HOLD_MINUTES as COURT_CHECKOUT_HOLD_MINUTES };
export { checkoutHoldSince as courtCheckoutHoldSince };

export function reservationBookerName(reservation: {
  user?: { name: string } | null;
  guestName?: string | null;
}) {
  return reservation.user?.name ?? reservation.guestName ?? "Gast";
}

/** Anzeige im Kalender: Kommentar/Label hat Vorrang vor dem Namen. */
export function reservationDisplayLabel(reservation: {
  label?: string | null;
  user?: { name: string } | null;
  guestName?: string | null;
}) {
  const label = reservation.label?.trim();
  if (label) return label;
  return reservationBookerName(reservation);
}

export function courtBookingPriceCents(
  priceCentsPerHour: number,
  startsAt: Date,
  endsAt: Date,
) {
  const hours = reservationHours(startsAt, endsAt);
  return Math.round(priceCentsPerHour * hours);
}

/** Kalendertag in Europe/Rome, Format JJJJ-MM-TT. */
export function clubCalendarDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Gast-Reservierung nur löschbar, solange in Lajen noch der Vortag oder früher ist. */
export function canCancelGuestReservation(startsAt: Date, now = new Date()) {
  return clubCalendarDay(now) < clubCalendarDay(startsAt);
}

export function canCancelPaidCourtReservation(
  startsAt: Date,
  cancelRefundMinutesBeforeStart: number,
  now = new Date(),
) {
  const deadline =
    startsAt.getTime() - cancelRefundMinutesBeforeStart * 60_000;
  return now.getTime() <= deadline;
}

export function formatCancelRefundMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} Minuten`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 Stunde" : `${hours} Stunden`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} Std. ${rest} Min.`;
}

export function courtReservationIsPaid(reservation: {
  priceCents: number;
  paidAt: Date | null;
}) {
  return reservation.priceCents > 0 && reservation.paidAt != null;
}
