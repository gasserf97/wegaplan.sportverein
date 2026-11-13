export const DEFAULT_MEMBERSHIP_CARD_TITLE = "ASC Lajen Mitgliedskarte";

/** Jahr aus einem Datum (lokal), oder null wenn ungültig. */
export function yearFromDate(date: Date | null | undefined): number | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

/**
 * Kalenderjahr der Mitgliedschaft: 1.1.2027–31.12.2027 → 2027.
 * periodStart zählt (Mittag-Puffer gegen Zeitzonen), sonst periodEnd.
 */
export function membershipPeriodYear(
  periodStart: Date | null | undefined,
  periodEnd: Date | null | undefined,
): number | null {
  if (periodStart && !Number.isNaN(periodStart.getTime())) {
    return new Date(periodStart.getTime() + 12 * 60 * 60 * 1000).getUTCFullYear();
  }
  if (periodEnd && !Number.isNaN(periodEnd.getTime())) {
    return new Date(periodEnd.getTime() - 12 * 60 * 60 * 1000).getUTCFullYear();
  }
  return null;
}

/**
 * Name auf Bestätigung: confirmationTitle falls gesetzt, sonst title.
 * Platzhalter `{year}` → periodYear; fehlt das Jahr, wird der Platzhalter entfernt.
 */
export function resolveConfirmationTitle(
  confirmationTitle: string | null | undefined,
  title: string,
  periodYear?: number | null,
): string {
  const template = confirmationTitle?.trim();
  if (!template) return title;

  if (periodYear != null && Number.isFinite(periodYear)) {
    return template.replace(/\{year\}/gi, String(periodYear));
  }

  return (
    template
      .replace(/\{year\}/gi, "")
      .replace(/\s+/g, " ")
      .trim() || title
  );
}

/** Überschrift der Mitgliedskarte: Name auf Bestätigung plus Jahr der Periode. */
export function resolveMembershipCardTitle(
  confirmationTitle: string | null | undefined,
  fallback = DEFAULT_MEMBERSHIP_CARD_TITLE,
  periodYear?: number | null,
): string {
  const hasYearPlaceholder = /\{year\}/i.test(confirmationTitle ?? "");
  const resolved = resolveConfirmationTitle(
    confirmationTitle,
    fallback,
    periodYear,
  );
  if (periodYear == null || !Number.isFinite(periodYear)) return resolved;
  const year = String(periodYear);
  if (hasYearPlaceholder || new RegExp(`\\b${year}\\b`).test(resolved)) {
    return resolved;
  }
  return `${resolved} ${year}`;
}
