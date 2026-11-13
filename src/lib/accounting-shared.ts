export const ALL_SECTIONS = "alle";
export const ALL_TIME = "alle";

export type AccountingSection = { id: string; name: string };

export const ACCOUNTING_PERIOD_KEYS = [
  "alle",
  "dieses-jahr",
  "letztes-jahr",
  "dieses-quartal",
  "letztes-quartal",
  "dieser-monat",
  "letzter-monat",
  "letzte-12-monate",
] as const;

export type AccountingPeriodKey = (typeof ACCOUNTING_PERIOD_KEYS)[number];

export function isAccountingPeriodKey(value: string): value is AccountingPeriodKey {
  return (ACCOUNTING_PERIOD_KEYS as readonly string[]).includes(value);
}

export function parseAccountingPeriodKey(
  value: string | undefined | null,
): AccountingPeriodKey {
  if (value && isAccountingPeriodKey(value)) return value;
  return ALL_TIME;
}

/** Inclusive start, exclusive end. Null bounds mean unbounded. */
export function accountingPeriodRange(
  key: AccountingPeriodKey,
  now = new Date(),
): { from: Date | null; to: Date | null } {
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (key) {
    case "dieses-jahr":
      return {
        from: new Date(year, 0, 1, 0, 0, 0, 0),
        to: new Date(year + 1, 0, 1, 0, 0, 0, 0),
      };
    case "letztes-jahr":
      return {
        from: new Date(year - 1, 0, 1, 0, 0, 0, 0),
        to: new Date(year, 0, 1, 0, 0, 0, 0),
      };
    case "dieses-quartal": {
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        from: new Date(year, quarterStart, 1, 0, 0, 0, 0),
        to: new Date(year, quarterStart + 3, 1, 0, 0, 0, 0),
      };
    }
    case "letztes-quartal": {
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        from: new Date(year, quarterStart - 3, 1, 0, 0, 0, 0),
        to: new Date(year, quarterStart, 1, 0, 0, 0, 0),
      };
    }
    case "dieser-monat":
      return {
        from: new Date(year, month, 1, 0, 0, 0, 0),
        to: new Date(year, month + 1, 1, 0, 0, 0, 0),
      };
    case "letzter-monat":
      return {
        from: new Date(year, month - 1, 1, 0, 0, 0, 0),
        to: new Date(year, month, 1, 0, 0, 0, 0),
      };
    case "letzte-12-monate":
      return {
        from: new Date(year, month - 11, 1, 0, 0, 0, 0),
        to: new Date(year, month + 1, 1, 0, 0, 0, 0),
      };
    case "alle":
    default:
      return { from: null, to: null };
  }
}

export function isDateInAccountingPeriod(
  date: Date,
  range: { from: Date | null; to: Date | null },
) {
  if (range.from && date < range.from) return false;
  if (range.to && date >= range.to) return false;
  return true;
}

export function accountingHref(options?: {
  sectionKey?: string;
  periodKey?: string;
}) {
  const params = new URLSearchParams();
  if (options?.sectionKey && options.sectionKey !== ALL_SECTIONS) {
    params.set("sektion", options.sectionKey);
  }
  if (options?.periodKey && options.periodKey !== ALL_TIME) {
    params.set("zeitraum", options.periodKey);
  }
  const query = params.toString();
  return query ? `/admin/buchhaltung?${query}` : "/admin/buchhaltung";
}
