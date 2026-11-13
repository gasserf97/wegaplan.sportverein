import type { Metadata } from "next";
import { CourseCard } from "@/components/course-card";
import { CourseCheckoutCleanup } from "@/components/court-checkout-cleanup";
import { SectionFilter } from "@/components/section-filter";
import { getCurrentUser } from "@/lib/auth";
import { expireStalePendingEnrollments } from "@/lib/expire-pending";
import {
  catalogCardGridClass,
  catalogUsesCompactCards,
} from "@/lib/catalog-layout";
import {
  audienceMatchesAnyAge,
  courseCatalogBadgesForUser,
  loadBookableCoursesWithSpotsLeft,
} from "@/lib/courses";
import { listHouseholdAges } from "@/lib/family";
import { getServerI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import {
  isAllSectionsSelected,
  matchesSectionFilter,
  parseSelectedSectionIds,
} from "@/lib/section-filter";
import { sectionListOrderBy } from "@/lib/section-order";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("courses.title") };
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ sektion?: string }>;
}) {
  const { t } = await getServerI18n();
  await expireStalePendingEnrollments();

  const [{ sektion }, courses, user, sections] = await Promise.all([
    searchParams,
    loadBookableCoursesWithSpotsLeft(),
    getCurrentUser(),
    prisma.section.findMany({
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
  ]);
  const householdAges = user ? await listHouseholdAges(user.id) : [];
  const offeredCourses = courses.filter((course) =>
    audienceMatchesAnyAge(
      householdAges,
      course.audienceMinAge,
      course.audienceMaxAge,
    ),
  );
  const availableIds = sections.map((section) => section.id);
  const selectedIds = parseSelectedSectionIds(sektion, availableIds);
  const allSelected = isAllSectionsSelected(selectedIds, availableIds);
  const visibleCourses = offeredCourses.filter((course) =>
    matchesSectionFilter(course.sectionId, selectedIds, availableIds),
  );
  const courseBadges = user
    ? await courseCatalogBadgesForUser(
        user.id,
        visibleCourses.map((course) => course.id),
        t,
      )
    : new Map();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <CourseCheckoutCleanup />
      <h1 className="text-4xl text-primary sm:text-5xl">{t("courses.title")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {user ? t("courses.hintMember") : t("courses.hintGuest")}
      </p>
      <SectionFilter sections={sections} selectedIds={selectedIds} />
      {visibleCourses.length === 0 ? (
        <p className="mt-10 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          {offeredCourses.length === 0 || allSelected
            ? t("courses.empty")
            : t("courses.filterEmpty")}
        </p>
      ) : (
        <div className={cn("mt-10", catalogCardGridClass(visibleCourses.length))}>
          {visibleCourses.map((course) => {
            const badge = courseBadges.get(course.id);
            return (
              <CourseCard
                key={course.id}
                {...course}
                compact={catalogUsesCompactCards(visibleCourses.length)}
                cornerBadge={badge?.label}
                cornerBadgeTone={badge?.tone}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
