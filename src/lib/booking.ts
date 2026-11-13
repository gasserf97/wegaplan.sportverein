/** Tennisplatz-Reservierung – Regeln ähnlich eTennis */
export const BOOKING = {
  slotMinutes: 30,
  openHour: 8,
  closeHour: 22,
  /** Max. Dauer pro Buchung für normale Mitglieder */
  maxHoursPerBooking: 2,
} as const;

export function durationOptions(maxHours: number) {
  const options: { minutes: number; label: string }[] = [];
  for (let minutes = BOOKING.slotMinutes; minutes <= maxHours * 60 + 0.001; minutes += BOOKING.slotMinutes) {
    const hours = minutes / 60;
    options.push({
      minutes,
      label: hours < 1 ? `${minutes} Min.` : `${String(hours).replace(".", ",")} Std.`,
    });
  }
  return options;
}

export function slotCount(durationMinutes: number) {
  return durationMinutes / BOOKING.slotMinutes;
}

export function formatSlotTime(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatSlotDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function buildDaySlots(day: Date) {
  const slots: Date[] = [];
  const base = new Date(day);
  base.setHours(BOOKING.openHour, 0, 0, 0);

  const startMinutes = BOOKING.openHour * 60;
  const endMinutes = BOOKING.closeHour * 60;
  for (let minutes = startMinutes; minutes < endMinutes; minutes += BOOKING.slotMinutes) {
    const slot = new Date(base);
    slot.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    slots.push(slot);
  }
  return slots;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Montag 00:00 der Kalenderwoche (Europe/Rome lokale Datumsbasis). */
export function startOfWeekMonday(date: Date) {
  const d = startOfDay(date);
  const weekday = d.getDay(); // 0 = So … 6 = Sa
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(d, offset);
}

export function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const fmt = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
  });
  const year = weekEnd.getFullYear();
  return `${fmt.format(weekStart)} – ${fmt.format(weekEnd)} ${year}`;
}

export function formatSlotWeekdayShort(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(date);
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function slotKey(courtId: string, startsAt: Date) {
  return `${courtId}:${startsAt.toISOString()}`;
}

export function parseDateParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfDay(new Date());
  }
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return startOfDay(new Date());
  return startOfDay(parsed);
}

export function toDateParam(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function slotEnd(startsAt: Date, durationMinutes: number = BOOKING.slotMinutes) {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

export function hoursBetween(a: Date, b: Date) {
  return Math.abs(b.getTime() - a.getTime()) / 3_600_000;
}

export function reservationHours(startsAt: Date, endsAt: Date) {
  return (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
}
