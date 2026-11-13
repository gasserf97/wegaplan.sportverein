import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRecentRegistrations } from "@/components/admin-recent-registrations";
import { SectionFilter } from "@/components/section-filter";
import { TogglePublishedButton } from "@/components/course-form";
import { DeleteCourseButton } from "@/components/delete-course-button";
import { HostingHealthBanner } from "@/components/hosting-health-banner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellActions,
  tableCellTruncate,
  tableHeadActions,
} from "@/components/ui/table";
import { getAdminCourseRegistrations } from "@/lib/admin-all-registrations";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { activeCourseEnrollmentWhere } from "@/lib/course-export";
import { formatEuro } from "@/lib/format";
import { formatRegistrationDeadline, isRegistrationOpen } from "@/lib/courses";
import { getServerI18n } from "@/lib/i18n";
import type { TFunction } from "@/lib/i18n/types";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { canAccessStaffAdmin, getManagedSectionIds } from "@/lib/permissions";
import { coursePriceSummary } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import {
  isAllSectionsSelected,
  mergeSectionIds,
  parseSelectedSectionIds,
  sectionIdWhere,
} from "@/lib/section-filter";
import { sectionListOrderBy } from "@/lib/section-order";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("admin.coursesTitle") };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sektion?: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/admin");
  const manager = await requireCourseManager();
  if (!manager) redirect("/admin/mitglieder");
  const isStaffAdmin = await canAccessStaffAdmin(user);
  const managedIds =
    user.role === "ADMIN" ? null : await getManagedSectionIds(user.id);
  const [{ sektion }, sections] = await Promise.all([
    searchParams,
    prisma.section.findMany({
      where:
        managedIds === null
          ? undefined
          : {
              id: {
                in: managedIds.length > 0 ? managedIds : ["__none__"],
              },
            },
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
  ]);
  const availableIds = sections.map((section) => section.id);
  const selectedIds = parseSelectedSectionIds(sektion, availableIds);
  const allSelected = isAllSectionsSelected(selectedIds, availableIds);
  const courseFilter = sectionIdWhere(
    mergeSectionIds(managedIds, allSelected ? null : selectedIds),
  );
  const [courses, courseRegistrations, paid] = await Promise.all([
    prisma.course.findMany({
      where: courseFilter,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        priceCents: true,
        childPriceCents: true,
        childMaxAge: true,
        published: true,
        registrationDeadline: true,
        requiresMedicalCertificate: true,
        section: { select: { name: true } },
        _count: {
          select: {
            enrollments: { where: activeCourseEnrollmentWhere },
          },
        },
      },
    }),
    getAdminCourseRegistrations({
      courseWhere: courseFilter,
      locale,
      t,
    }),
    prisma.enrollment.findMany({
      where: {
        status: "PAID",
        course: {
          bundledPlanId: null,
          ...courseFilter,
        },
      },
      select: {
        paidCents: true,
        creditAppliedCents: true,
        course: { select: { priceCents: true } },
      },
    }),
  ]);
  const revenue = paid.reduce(
    (sum, item) =>
      sum +
      externalPaymentDueCents(
        item.paidCents,
        item.course.priceCents,
        item.creditAppliedCents,
        false,
      ),
    0,
  );
  const activeCourses = courses.filter((course) =>
    isRegistrationOpen(course.registrationDeadline),
  );
  const pastCourses = courses.filter(
    (course) =>
      course.registrationDeadline != null &&
      !isRegistrationOpen(course.registrationDeadline),
  );
  const canCreate = managedIds === null || managedIds.length > 0;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      {isStaffAdmin ? <HostingHealthBanner /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl text-primary">{t("admin.coursesTitle")}</h1>
          <p className="mt-2 text-muted-foreground">
            {user.role === "ADMIN"
              ? t("admin.coursesDescGlobal")
              : t("admin.coursesDescSection")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <Link
              href="/admin/kurse/neu"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              {t("admin.newCourse")}
            </Link>
          ) : null}
          <Link
            href="/admin/mitglieder"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            {t("admin.members")}
          </Link>
        </div>
      </div>
      <SectionFilter sections={sections} selectedIds={selectedIds} />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat
          label={t("admin.statsCourses")}
          value={String(activeCourses.length)}
        />
        <Stat
          label={t("admin.statsCourseEnrollments")}
          value={String(courseRegistrations.length)}
        />
        <Stat label={t("admin.statsRevenue")} value={formatEuro(revenue)} />
      </div>
      <h2 className="mt-12 text-2xl">{t("admin.currentCourses")}</h2>
      {activeCourses.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          {!allSelected && pastCourses.length === 0
            ? t("admin.filterEmptyCourses")
            : canCreate
              ? pastCourses.length > 0
                ? t("admin.noOpenCourses")
                : t("admin.noCourses")
              : t("admin.noSectionAssigned")}
        </p>
      ) : (
        <CourseTable courses={activeCourses} showStatus t={t} />
      )}
      {pastCourses.length > 0 ? (
        <>
          <h2 className="mt-12 text-2xl">{t("admin.pastCourses")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("admin.pastCoursesHint")}
          </p>
          <CourseTable courses={pastCourses} showDeadline t={t} />
        </>
      ) : null}
      <h2 className="mt-12 text-2xl">{t("admin.recentCourseEnrollments")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("admin.recentCourseTransactionsHint")}
      </p>
      <AdminRecentRegistrations
        emptyLabel={t("admin.noBookings")}
        items={courseRegistrations}
      />
    </div>
  );
}

type AdminCourseRow = {
  id: string;
  title: string;
  priceCents: number;
  childPriceCents: number | null;
  childMaxAge: number;
  published: boolean;
  registrationDeadline: Date | null;
  requiresMedicalCertificate: boolean;
  section: { name: string } | null;
  _count: { enrollments: number };
};

function CourseTable({
  courses,
  showStatus = false,
  showDeadline = false,
  t,
}: {
  courses: AdminCourseRow[];
  showStatus?: boolean;
  showDeadline?: boolean;
  t: TFunction;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead className={tableCellTruncate}>
              {t("admin.tableTitle")}
            </TableHead>
            <TableHead>{t("admin.tableSection")}</TableHead>
            <TableHead>{t("admin.tablePrice")}</TableHead>
            {showStatus ? (
              <TableHead>{t("admin.tableStatus")}</TableHead>
            ) : null}
            {showDeadline ? (
              <TableHead>{t("admin.tableDeadline")}</TableHead>
            ) : null}
            <TableHead>{t("admin.tableEnrollments")}</TableHead>
            <TableHead className={tableHeadActions}>
              {t("admin.tableActions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {courses.map((course) => (
            <TableRow key={course.id}>
              <TableCell
                className={`font-medium ${tableCellTruncate}`}
                title={course.title}
              >
                {course.title}
              </TableCell>
              <TableCell>{course.section?.name ?? "—"}</TableCell>
              <TableCell>{coursePriceSummary(course)}</TableCell>
              {showStatus ? (
                <TableCell>
                  <Badge variant={course.published ? "default" : "secondary"}>
                    {course.published ? t("admin.public") : t("admin.draft")}
                  </Badge>
                </TableCell>
              ) : null}
              {showDeadline && course.registrationDeadline ? (
                <TableCell className="text-muted-foreground">
                  {formatRegistrationDeadline(course.registrationDeadline)}
                </TableCell>
              ) : showDeadline ? (
                <TableCell>—</TableCell>
              ) : null}
              <TableCell>{course._count.enrollments}</TableCell>
              <TableCell className={tableCellActions}>
                <div className="flex flex-wrap justify-end gap-2">
                  {showStatus ? (
                    <TogglePublishedButton
                      courseId={course.id}
                      published={course.published}
                    />
                  ) : null}
                  <Link
                    href={`/admin/kurse/${course.id}`}
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem]"
                  >
                    {t("admin.edit")}
                  </Link>
                  <Link
                    href={`/admin/kurse/${course.id}/anmeldungen`}
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem]"
                  >
                    {t("admin.attestations")}
                  </Link>
                  <DeleteCourseButton
                    courseId={course.id}
                    canDelete={course._count.enrollments === 0}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-3xl">{value}</p>
    </div>
  );
}
