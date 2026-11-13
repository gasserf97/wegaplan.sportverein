import { formatDate } from "@/lib/format";
import type { TFunction } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n/types";

export function formatCourseAudience(
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  t: TFunction,
): string | null {
  if (minAge == null && maxAge == null) return null;
  if (minAge != null && maxAge != null) {
    return t("courses.audienceMinMax", { min: minAge, max: maxAge });
  }
  if (maxAge != null) {
    return maxAge <= 17
      ? t("courses.audienceChildrenUpTo", { max: maxAge })
      : t("courses.audienceUpTo", { max: maxAge });
  }
  if (minAge != null) {
    return minAge >= 18
      ? t("courses.audienceAdultsFrom", { min: minAge })
      : t("courses.audienceFrom", { min: minAge });
  }
  return null;
}

export function personMatchesAudience(
  age: number,
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
): boolean {
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

/** Leer = kein Haushalt bekannt (Gast): alles anzeigen. Sonst reicht eine passende Person. */
export function audienceMatchesAnyAge(
  ages: readonly number[],
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
): boolean {
  if (ages.length === 0) return true;
  return ages.some((age) => personMatchesAudience(age, minAge, maxAge));
}

export function audienceMismatchReason(
  age: number,
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  t: TFunction,
): string | null {
  if (personMatchesAudience(age, minAge, maxAge)) return null;
  const label = formatCourseAudience(minAge, maxAge, t);
  return label ? t("courses.audienceOnlyFor", { label }) : t("courses.audienceMismatch");
}

export function formatRegistrationDeadline(
  deadline: Date,
  locale: Locale = "de",
): string {
  return formatDate(deadline, locale);
}

/** Anmeldefrist gilt als „endet bald“, wenn sie in höchstens so vielen Tagen schließt. */
export const COURSE_CLOSING_SOON_DAYS = 7;

export function isCourseClosingSoon(
  registrationDeadline: Date | null | undefined,
  now = new Date(),
  withinDays = COURSE_CLOSING_SOON_DAYS,
) {
  if (!registrationDeadline) return false;
  const end = new Date(registrationDeadline);
  end.setHours(23, 59, 59, 999);
  if (now > end) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(registrationDeadline);
  deadlineDay.setHours(0, 0, 0, 0);
  const days = Math.round(
    (deadlineDay.getTime() - today.getTime()) / 86_400_000,
  );
  return days >= 0 && days <= withinDays;
}

export function formatCourseSpotsLeftLabel(
  spotsLeft: number | null,
  t: TFunction,
): string | null {
  if (spotsLeft == null) return null;
  if (spotsLeft === 0) return t("courses.soldOut");
  if (spotsLeft === 1) return t("courses.spotsLeft1");
  return t("courses.spotsLeftN", { n: spotsLeft });
}
