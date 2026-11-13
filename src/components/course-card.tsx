"use client";

import Link from "next/link";
import { getAccent, resolveAccent } from "@/lib/accents";
import {
  type CatalogBadgeTone,
  catalogBadgeToneClass,
} from "@/lib/catalog-badges";
import {
  formatCourseAudience,
  formatCourseSpotsLeftLabel,
  formatRegistrationDeadline,
  isCourseClosingSoon,
} from "@/lib/courses-display";
import { countCourseUnits, formatCourseSchedule } from "@/lib/course-schedule";
import { formatDate } from "@/lib/format";
import { courseCardDisplay } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/locale-provider";

type CourseCardProps = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  childPriceCents?: number | null;
  childMaxAge?: number | null;
  priceLabel?: string;
  priceHint?: string;
  location?: string;
  scheduleWeekdays?: number[];
  scheduleStartMinute?: number | null;
  scheduleEndMinute?: number | null;
  accent: string;
  href?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  registrationDeadline?: Date | null;
  audienceMinAge?: number | null;
  audienceMaxAge?: number | null;
  spotsLeft?: number | null;
  cornerBadge?: string;
  cornerBadgeTone?: CatalogBadgeTone;
  statusHint?: string;
  showPrice?: boolean;
  /** Engere Karten für Kataloge mit vielen Einträgen (4 pro Zeile). */
  compact?: boolean;
};

export function CourseCard({
  id,
  title,
  description,
  priceCents,
  childPriceCents,
  childMaxAge,
  priceLabel,
  priceHint,
  location,
  scheduleWeekdays,
  scheduleStartMinute,
  scheduleEndMinute,
  accent,
  href,
  startsAt,
  endsAt,
  registrationDeadline,
  audienceMinAge,
  audienceMaxAge,
  spotsLeft,
  cornerBadge,
  cornerBadgeTone = "success",
  statusHint,
  showPrice = true,
  compact = false,
}: CourseCardProps) {
  const { locale, t } = useI18n();
  const visual = getAccent(resolveAccent(accent));
  const priceDisplay = courseCardDisplay({
    priceCents,
    childPriceCents: childPriceCents ?? null,
    childMaxAge: childMaxAge ?? 18,
  });
  const displayPriceHint = priceHint ?? priceDisplay.priceHint;
  const audienceLabel = formatCourseAudience(audienceMinAge, audienceMaxAge, t);
  const spotsLeftLabel = formatCourseSpotsLeftLabel(spotsLeft ?? null, t);

  const scheduleLabel = formatCourseSchedule(
    scheduleWeekdays,
    scheduleStartMinute,
    scheduleEndMinute,
    locale,
  );
  const periodLabel =
    startsAt && endsAt
      ? t("courses.periodDates", {
          start: formatDate(startsAt, locale),
          end: formatDate(endsAt, locale),
        })
      : startsAt
        ? t("courses.startDate", { date: formatDate(startsAt, locale) })
        : endsAt
          ? t("courses.endDate", { date: formatDate(endsAt, locale) })
          : null;
  const unitCount = countCourseUnits({
    scheduleWeekdays,
    startsAt,
    endsAt,
  });
  const unitsLabel =
    unitCount == null
      ? null
      : unitCount === 1
        ? t("courses.unitsOne")
        : t("courses.unitsMany", { n: unitCount });
  const closingSoon = isCourseClosingSoon(registrationDeadline);

  return (
    <Link
      href={href ?? `/kurse/${id}`}
      className={cn(
        "group flex h-full flex-col rounded-xl border-2 bg-card transition-shadow hover:shadow-md",
        compact ? "p-3" : "p-5",
        visual.borderClass,
      )}
    >
      <div className={cn("flex flex-1 flex-col", compact ? "gap-2" : "gap-3")}>
        <div className="flex flex-wrap items-center gap-2">
          {cornerBadge ? (
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-semibold leading-tight tracking-wide shadow-sm",
                catalogBadgeToneClass[cornerBadgeTone],
              )}
            >
              {cornerBadge}
            </span>
          ) : null}
          {closingSoon ? (
            <Badge variant="warning">{t("courses.closingSoonBadge")}</Badge>
          ) : null}
          {scheduleLabel ? (
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">
              {scheduleLabel}
            </Badge>
          ) : null}
          {periodLabel ? (
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">
              {periodLabel}
            </Badge>
          ) : null}
          {unitsLabel ? <Badge variant="outline">{unitsLabel}</Badge> : null}
          {location ? (
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">
              {location}
            </Badge>
          ) : null}
          {audienceLabel ? (
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">
              {audienceLabel}
            </Badge>
          ) : null}
          {spotsLeftLabel ? (
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">
              {spotsLeftLabel}
            </Badge>
          ) : null}
          {registrationDeadline ? (
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal text-left">
              {t("courses.cardDeadline", {
                date: formatRegistrationDeadline(registrationDeadline),
              })}
            </Badge>
          ) : null}
        </div>
        <h3
          className={cn(
            "font-heading group-hover:underline",
            compact ? "text-lg leading-snug" : "text-2xl leading-tight",
          )}
        >
          {title}
        </h3>
        {statusHint ? (
          <p className="text-sm font-medium text-emerald-700">{statusHint}</p>
        ) : null}
        <p
          className={cn(
            "text-sm text-muted-foreground",
            compact ? "line-clamp-2 leading-5" : "line-clamp-3 leading-6",
          )}
        >
          {description || "\u00a0"}
        </p>
        {showPrice ? (
          <div className={cn("mt-auto", compact ? "space-y-0.5 pt-2" : "space-y-1 pt-3")}>
            <p
              className={cn(
                "font-heading text-foreground",
                compact ? "text-lg" : "text-2xl",
              )}
            >
              {priceLabel ?? priceDisplay.priceLabel}
            </p>
            {displayPriceHint ? (
              <p className="text-xs text-muted-foreground">
                {displayPriceHint}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
