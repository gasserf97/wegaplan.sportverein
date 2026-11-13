import { BOOKING } from "@/lib/booking";
import { CLUB_TIMEZONE } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const TENNIS_SEASON_MONTHS = [4, 5, 6, 7, 8, 9, 10] as const;
export type TennisSeasonMonth = (typeof TENNIS_SEASON_MONTHS)[number];

/** Prime-time window for utilization (local club time). End exclusive. */
export const TENNIS_PEAK_START_HOUR = 17;
export const TENNIS_PEAK_END_HOUR = 20;

const MONTH_LABELS_DE: Record<TennisSeasonMonth, string> = {
  4: "April",
  5: "Mai",
  6: "Juni",
  7: "Juli",
  8: "August",
  9: "September",
  10: "Oktober",
};

export function tennisSeasonMonthLabel(month: TennisSeasonMonth) {
  return MONTH_LABELS_DE[month];
}

export function defaultTennisSeasonYear(now = new Date()) {
  const parts = romeDateParts(now);
  // Vor April: letzte abgeschlossene/laufende Auswahl = Vorjahr; ab April aktuelles Jahr.
  return parts.month < 4 ? parts.year - 1 : parts.year;
}

export function availableTennisSeasonYears(now = new Date()) {
  const current = defaultTennisSeasonYear(now);
  const years: number[] = [];
  for (let year = current; year >= current - 6; year -= 1) {
    years.push(year);
  }
  return years;
}

type RomeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function romeDateParts(date: Date): RomeParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function seasonQueryRange(year: number) {
  // Wide UTC window covering Apr 1–Oct 31 Europe/Rome including DST edges.
  return {
    startsAt: new Date(Date.UTC(year, 2, 30, 0, 0, 0)),
    endsAt: new Date(Date.UTC(year, 10, 2, 0, 0, 0)),
  };
}

function emptyMonthStats(): Record<
  TennisSeasonMonth,
  { bookedHours: number; peakBookedHours: number }
> {
  return {
    4: { bookedHours: 0, peakBookedHours: 0 },
    5: { bookedHours: 0, peakBookedHours: 0 },
    6: { bookedHours: 0, peakBookedHours: 0 },
    7: { bookedHours: 0, peakBookedHours: 0 },
    8: { bookedHours: 0, peakBookedHours: 0 },
    9: { bookedHours: 0, peakBookedHours: 0 },
    10: { bookedHours: 0, peakBookedHours: 0 },
  };
}

function isSeasonMonth(month: number): month is TennisSeasonMonth {
  return month >= 4 && month <= 10;
}

function isPeakSlot(hour: number, minute: number) {
  const minutes = hour * 60 + minute;
  return (
    minutes >= TENNIS_PEAK_START_HOUR * 60 &&
    minutes < TENNIS_PEAK_END_HOUR * 60
  );
}

export type TennisSeasonMonthRow = {
  month: TennisSeasonMonth;
  label: string;
  bookedHours: number;
  peakBookedHours: number;
  peakAvailableHours: number;
  /** 0–100, null if no capacity */
  peakUtilizationPercent: number | null;
};

export type TennisSeasonReport = {
  year: number;
  courtCount: number;
  reservationCount: number;
  peakWindowLabel: string;
  months: TennisSeasonMonthRow[];
  totals: {
    bookedHours: number;
    peakBookedHours: number;
    peakAvailableHours: number;
    peakUtilizationPercent: number | null;
  };
};

function utilizationPercent(booked: number, available: number) {
  if (available <= 0) return null;
  return Math.round((booked / available) * 1000) / 10;
}

export function formatReportHours(hours: number) {
  const rounded = Math.round(hours * 100) / 100;
  return `${String(rounded).replace(".", ",")} Std.`;
}

export function formatUtilizationPercent(value: number | null) {
  if (value == null) return "—";
  return `${String(value).replace(".", ",")} %`;
}

export async function loadTennisSeasonReport(
  year: number,
): Promise<TennisSeasonReport> {
  const range = seasonQueryRange(year);
  const slotHours = BOOKING.slotMinutes / 60;

  const [courtCount, reservations] = await Promise.all([
    prisma.court.count({ where: { active: true } }),
    prisma.courtReservation.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: range.endsAt },
        endsAt: { gt: range.startsAt },
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  const effectiveCourtCount = Math.max(courtCount, 0);
  const monthStats = emptyMonthStats();
  const peakHoursPerDayPerCourt =
    TENNIS_PEAK_END_HOUR - TENNIS_PEAK_START_HOUR;

  for (const reservation of reservations) {
    const stepMs = BOOKING.slotMinutes * 60_000;
    let cursor = reservation.startsAt.getTime();
    const endMs = reservation.endsAt.getTime();
    while (cursor + stepMs <= endMs + 1) {
      const parts = romeDateParts(new Date(cursor));
      if (parts.year === year && isSeasonMonth(parts.month)) {
        monthStats[parts.month].bookedHours += slotHours;
        if (isPeakSlot(parts.hour, parts.minute)) {
          monthStats[parts.month].peakBookedHours += slotHours;
        }
      }
      cursor += stepMs;
    }
  }

  const months: TennisSeasonMonthRow[] = TENNIS_SEASON_MONTHS.map((month) => {
    const stats = monthStats[month];
    const peakAvailableHours =
      daysInMonth(year, month) *
      peakHoursPerDayPerCourt *
      effectiveCourtCount;
    return {
      month,
      label: tennisSeasonMonthLabel(month),
      bookedHours: Math.round(stats.bookedHours * 100) / 100,
      peakBookedHours: Math.round(stats.peakBookedHours * 100) / 100,
      peakAvailableHours,
      peakUtilizationPercent: utilizationPercent(
        stats.peakBookedHours,
        peakAvailableHours,
      ),
    };
  });

  const totalsBooked = months.reduce((sum, row) => sum + row.bookedHours, 0);
  const totalsPeakBooked = months.reduce(
    (sum, row) => sum + row.peakBookedHours,
    0,
  );
  const totalsPeakAvailable = months.reduce(
    (sum, row) => sum + row.peakAvailableHours,
    0,
  );

  return {
    year,
    courtCount: effectiveCourtCount,
    reservationCount: reservations.length,
    peakWindowLabel: `${String(TENNIS_PEAK_START_HOUR).padStart(2, "0")}:00–${String(TENNIS_PEAK_END_HOUR).padStart(2, "0")}:00`,
    months,
    totals: {
      bookedHours: Math.round(totalsBooked * 100) / 100,
      peakBookedHours: Math.round(totalsPeakBooked * 100) / 100,
      peakAvailableHours: totalsPeakAvailable,
      peakUtilizationPercent: utilizationPercent(
        totalsPeakBooked,
        totalsPeakAvailable,
      ),
    },
  };
}
