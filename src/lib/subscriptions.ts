import type { PlanKind, Prisma, SubscriptionInterval } from "@/generated/prisma/client";
import { formatDate, formatDateTime } from "@/lib/format";
import type { TFunction } from "@/lib/i18n/types";

/** Canonical club membership plan – always listed first in catalogs. */
export const CLUB_MEMBERSHIP_PLAN_ID = "abo-mitgliedschaft";

/** MEMBERSHIP before ADDON; club membership pinned first; then createdAt. */
export function sortPlansForCatalog<
  T extends { id: string; kind: PlanKind; createdAt: Date },
>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const kindRank = (kind: PlanKind) => (kind === "MEMBERSHIP" ? 0 : 1);
    const byKind = kindRank(a.kind) - kindRank(b.kind);
    if (byKind !== 0) return byKind;
    const pin = (id: string) => (id === CLUB_MEMBERSHIP_PLAN_ID ? 0 : 1);
    const byPin = pin(a.id) - pin(b.id);
    if (byPin !== 0) return byPin;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

const INTERVAL_STRIPE: Record<
  SubscriptionInterval,
  "day" | "month" | "year" | null
> = {
  MONTHLY: "month",
  YEARLY_CALENDAR: null,
  YEARLY_ROLLING: "year",
  DAILY: "day",
  MINUTELY: null,
  YEARLY: "year",
};

/** Map deprecated DB values to current billing logic. */
export function normalizeInterval(
  interval: SubscriptionInterval,
): SubscriptionInterval {
  if (interval === "YEARLY") return "YEARLY_ROLLING";
  // MINUTELY bleibt Spezialfall für lokale Test-Verlängerung; DAILY ist aktiv (Admin-Test).
  if (interval === "MINUTELY") return "MINUTELY";
  return interval;
}

function intervalLabel(interval: SubscriptionInterval, t: TFunction): string {
  const kind = normalizeInterval(interval);
  if (kind === "DAILY") return t("subscriptions.intervalDaily");
  if (kind === "MINUTELY") return t("subscriptions.intervalMinutelyLegacy");
  if (kind === "MONTHLY") return t("subscriptions.intervalMonthly");
  if (kind === "YEARLY_CALENDAR") return t("subscriptions.intervalYearlyCalendar");
  if (kind === "YEARLY_ROLLING") return t("subscriptions.intervalYearlyRolling");
  return t("subscriptions.intervalYearlyRolling");
}

function intervalPer(interval: SubscriptionInterval, t: TFunction): string {
  const kind = normalizeInterval(interval);
  if (kind === "DAILY") return t("common.perDay");
  if (kind === "MINUTELY") return t("common.perMinute");
  if (kind === "MONTHLY") return t("common.perMonth");
  if (kind === "YEARLY_CALENDAR") return t("common.perCalendarYear");
  if (kind === "YEARLY_ROLLING") return t("common.perYearFromPurchase");
  return t("common.perYearFromPurchase");
}

export function intervalMeta(interval: SubscriptionInterval, t: TFunction) {
  const normalized = normalizeInterval(interval);
  return {
    value: normalized,
    label: intervalLabel(interval, t),
    per: intervalPer(interval, t),
    stripe: INTERVAL_STRIPE[interval] ?? INTERVAL_STRIPE[normalized],
  };
}

function startOfDay(now = new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** True if the plan may appear in public catalogs / be purchased now. */
export function isPlanPubliclyVisible(
  plan: {
    published: boolean;
    visibleFrom?: Date | null;
    visibleUntil?: Date | null;
  },
  now = new Date(),
) {
  if (!plan.published) return false;
  if (plan.visibleFrom && now < startOfDay(plan.visibleFrom)) return false;
  if (plan.visibleUntil && now > endOfDay(plan.visibleUntil)) return false;
  return true;
}

/** Prisma filter: veröffentlicht und innerhalb des Anzeigezeitraums. */
export function publiclyVisiblePlanWhere(
  now = new Date(),
): Prisma.SubscriptionPlanWhereInput {
  const today = startOfDay(now);
  return {
    published: true,
    AND: [
      { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
      { OR: [{ visibleUntil: null }, { visibleUntil: { gte: today } }] },
    ],
  };
}

/** Öffentliche Intervalle im Abo-Formular. */
export const SUBSCRIPTION_INTERVAL_VALUES = [
  "YEARLY_CALENDAR",
  "YEARLY_ROLLING",
  "MONTHLY",
] as const satisfies readonly SubscriptionInterval[];

/** Nur für Haupt-Admins sichtbar (Kurztests). */
export const ADMIN_TEST_INTERVAL_VALUES = ["DAILY"] as const satisfies readonly SubscriptionInterval[];

export function subscriptionIntervalOptions(
  t: TFunction,
  options?: { includeAdminTestIntervals?: boolean },
) {
  const values: SubscriptionInterval[] = [
    ...SUBSCRIPTION_INTERVAL_VALUES,
    ...(options?.includeAdminTestIntervals
      ? ADMIN_TEST_INTERVAL_VALUES
      : []),
  ];
  return values.map((value) => ({
    value,
    label:
      value === "DAILY"
        ? `${intervalMeta(value, t).label} (Test)`
        : intervalMeta(value, t).label,
  }));
}

function calendarYearBounds(year: number) {
  return {
    periodStart: new Date(year, 0, 1, 0, 0, 0, 0),
    periodEnd: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

/** Calendar-year period immediately following the supplied date. */
export function nextCalendarYearPeriod(now = new Date()) {
  return calendarYearBounds(now.getFullYear() + 1);
}

/** First period when a subscription is activated or purchased. */
export function initialSubscriptionPeriod(
  interval: SubscriptionInterval,
  now = new Date(),
) {
  const kind = normalizeInterval(interval);
  if (kind === "YEARLY_CALENDAR") {
    return calendarYearBounds(now.getFullYear());
  }

  const periodStart = new Date(now);
  return {
    periodStart,
    periodEnd: addInterval(periodStart, kind),
  };
}

/** Next period after renewal (from previous period end). */
export function renewSubscriptionPeriod(
  interval: SubscriptionInterval,
  currentPeriodEnd: Date | null | undefined,
  now = new Date(),
) {
  const kind = normalizeInterval(interval);

  if (kind === "YEARLY_CALENDAR") {
    const year = (currentPeriodEnd ?? now).getFullYear() + 1;
    return calendarYearBounds(year);
  }

  const periodStart = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date(now);
  return {
    periodStart,
    periodEnd: addInterval(periodStart, kind),
  };
}

export function addInterval(from: Date, interval: SubscriptionInterval) {
  const kind = normalizeInterval(interval);
  const next = new Date(from);

  if (kind === "MINUTELY") {
    next.setMinutes(next.getMinutes() + 1);
  } else if (kind === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else if (kind === "MONTHLY") {
    next.setMonth(next.getMonth() + 1);
  } else if (kind === "YEARLY_CALENDAR") {
    return calendarYearBounds(from.getFullYear()).periodEnd;
  } else {
    next.setFullYear(next.getFullYear() + 1);
  }

  return next;
}

/** True while status ACTIVE and period has not ended. */
export function isSubscriptionPeriodValid(
  periodEnd: Date | null | undefined,
  now = new Date(),
) {
  return periodEnd == null || periodEnd >= now;
}

/** Human-readable active period for account and plan pages. */
export function subscriptionValidityLabels(
  interval: SubscriptionInterval,
  periodStart: Date | null | undefined,
  periodEnd: Date | null | undefined,
  paidAt: Date | null | undefined,
  t: TFunction,
) {
  const fmt =
    interval === "MINUTELY" || interval === "DAILY"
      ? formatDateTime
      : formatDate;
  const since = periodStart ?? paidAt ?? null;
  return {
    since: since ? t("subscriptions.validitySince", { date: fmt(since) }) : null,
    until: periodEnd
      ? t("subscriptions.validityUntil", { date: fmt(periodEnd) })
      : t("subscriptions.validityOpen"),
  };
}

export function autoRenewSentence(
  kind: string,
  autoRenew: boolean,
  t: TFunction,
  dateLabel?: string | null,
) {
  if (!autoRenew) return null;
  const membership = kind === "MEMBERSHIP";
  if (dateLabel) {
    return t(
      membership
        ? "subscriptions.membershipRenewsOn"
        : "subscriptions.aboRenewsOn",
      { date: dateLabel },
    );
  }
  return t(
    membership ? "subscriptions.membershipRenews" : "subscriptions.aboRenews",
  );
}

export function joinMetaParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" · ");
}

/** Compact status line: hide “valid until” when auto-renew already names the next charge. */
export function subscriptionStatusMeta(
  t: TFunction,
  input: {
    since: string | null;
    until: string | null;
    autoRenew: boolean;
    renewDateLabel?: string | null;
  },
) {
  return joinMetaParts([
    input.since,
    input.autoRenew ? null : input.until,
    input.autoRenew
      ? input.renewDateLabel
        ? t("subscriptions.renewsOnShort", { date: input.renewDateLabel })
        : t("subscriptions.renewsShort")
      : null,
  ]);
}

/** Prisma filter: ACTIVE and still within period (or open-ended). */
export function currentlyValidSubscriptionFilter(now = new Date()) {
  return {
    status: "ACTIVE" as const,
    AND: [
      { OR: [{ periodStart: null }, { periodStart: { lte: now } }] },
      { OR: [{ periodEnd: null }, { periodEnd: { gte: now } }] },
    ],
  };
}

/** Rows that count as current signups in admin plan views and deletion guards. */
export function currentAdminSubscriptionFilter(now = new Date()) {
  return {
    OR: [
      currentlyValidSubscriptionFilter(now),
      { status: "SCHEDULED" as const },
      {
        status: "PENDING" as const,
        paymentMethod: "BANK_TRANSFER" as const,
      },
    ],
  };
}

/** Offene Überweisung – Karten-Checkouts ohne Zahlung zählen nicht. */
export function isPendingBankTransfer(item: {
  status: string;
  paymentMethod?: string | null;
}) {
  return item.status === "PENDING" && item.paymentMethod === "BANK_TRANSFER";
}
