import type { TFunction } from "@/lib/i18n/types";

export type CatalogBadgeTone = "success" | "pending" | "waitlist";

export type CatalogBadge = {
  label: string;
  tone: CatalogBadgeTone;
};

const TONE_PRIORITY: Record<CatalogBadgeTone, number> = {
  success: 3,
  waitlist: 2,
  pending: 1,
};

export function preferCatalogBadge(
  current: CatalogBadge | undefined,
  next: CatalogBadge,
): CatalogBadge {
  if (!current) return next;
  return TONE_PRIORITY[next.tone] > TONE_PRIORITY[current.tone] ? next : current;
}

export function paymentPendingCatalogBadge(
  paymentMethod: string | null | undefined,
  t: TFunction,
): CatalogBadge | null {
  if (paymentMethod === "BANK_TRANSFER") {
    return { label: t("courses.catalogBadgePaymentUnconfirmed"), tone: "pending" };
  }
  return null;
}

/** Vorname für kurze Badges (erster Namensbestandteil). */
export function catalogBadgeFirstName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function joinNames(names: string[], andWord: string) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} ${andWord} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} ${andWord} ${names[names.length - 1]}`;
}

/**
 * Erfolg-Badge:
 * – alle in der Familie → „Alle bereits angemeldet“
 * – nur ein Teil → „{Name} angemeldet“ / „{Name} und {Name} angemeldet“
 * – allein (keine Familie) → „Bereits angemeldet“
 */
export function familyAlreadyEnrolledBadge(
  enrolledNames: string[],
  familySize: number,
  t: TFunction,
): CatalogBadge | null {
  if (enrolledNames.length <= 0 || familySize <= 0) return null;
  if (familySize > 1 && enrolledNames.length >= familySize) {
    return {
      label: t("courses.catalogBadgeEnrolledAllFamily"),
      tone: "success",
    };
  }
  if (familySize <= 1) {
    return { label: t("courses.catalogBadgeEnrolled"), tone: "success" };
  }
  const shortNames = enrolledNames.map(catalogBadgeFirstName);
  const names = joinNames(shortNames, t("common.and"));
  return {
    label: t("courses.catalogBadgeEnrolledNamed", { names }),
    tone: "success",
  };
}

export const catalogBadgeToneClass: Record<CatalogBadgeTone, string> = {
  success: "bg-emerald-600 text-white",
  pending: "bg-yellow-400 text-yellow-950",
  waitlist: "bg-slate-600 text-white",
};
