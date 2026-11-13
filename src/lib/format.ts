import type { Locale } from "@/lib/i18n/types";

/** Club local time (Italy): UTC+1 winter / UTC+2 summer. */
export const CLUB_TIMEZONE = "Europe/Rome";

function intlLocale(locale: Locale = "de") {
  return locale === "it" ? "it-IT" : "de-DE";
}

function dateTimeOptions(
  extra: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  return { timeZone: CLUB_TIMEZONE, ...extra };
}

export function formatEuro(cents: number, locale: Locale = "de") {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function formatDate(date: Date, locale: Locale = "de") {
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    dateTimeOptions({ dateStyle: "long" }),
  ).format(date);
}

export function formatDateTime(date: Date, locale: Locale = "de") {
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    dateTimeOptions({ dateStyle: "medium", timeStyle: "short" }),
  ).format(date);
}

export function formatShortDate(date: Date, locale: Locale = "de") {
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    dateTimeOptions({ dateStyle: "medium" }),
  ).format(date);
}

export function parseEuroToCents(value: string) {
  const normalized = value.replace(/\s/g, "").replace("€", "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function parseBirthDate(value: string): Date | null {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  if (date > today) return null;
  // Platzhalter für unvollständige Profile nicht als echtes Datum akzeptieren.
  if (date.toISOString().slice(0, 10) === "1900-01-01") return null;
  return date;
}

/** Leer, wenn noch kein echtes Geburtsdatum gesetzt ist (Placeholder 1900-01-01). */
export function toDateInputValue(date: Date | null | undefined) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString().slice(0, 10);
  if (iso === "1900-01-01") return "";
  return iso;
}

export function formatBirthDate(date: Date, locale: Locale = "de") {
  if (!date || Number.isNaN(date.getTime())) return "—";
  if (date.toISOString().slice(0, 10) === "1900-01-01") return "—";
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    dateTimeOptions({ dateStyle: "medium" }),
  ).format(date);
}
