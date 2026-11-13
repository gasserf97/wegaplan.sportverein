import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseForm } from "@/components/course-form";
import { DeleteCourseButton } from "@/components/delete-course-button";
import { getManageableSectionsForCurrentUser } from "@/app/actions/courses";
import { formatClock } from "@/lib/course-schedule";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { activeCourseEnrollmentWhere } from "@/lib/course-export";
import { canManageCourse } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Kurs bearbeiten" };

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const manager = await requireCourseManager();
  if (!manager) redirect("/anmelden?next=/admin");

  const { id } = await params;
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) notFound();

  if (!(await canManageCourse(manager.id, course))) {
    redirect("/admin");
  }

  const sections = await getManageableSectionsForCurrentUser();
  if (sections.length === 0) notFound();

  const user = await getCurrentUser();
  const isSuperAdmin = user?.role === "ADMIN";
  const subscriptionPlans = isSuperAdmin
    ? await prisma.subscriptionPlan.findMany({
        where: { kind: "MEMBERSHIP", interval: "YEARLY_CALENDAR" },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      })
    : [];

  const activeEnrollments = await prisma.enrollment.count({
    where: {
      courseId: course.id,
      ...activeCourseEnrollmentWhere,
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl">Kurs bearbeiten</h1>
      <p className="mt-2 mb-8 text-muted-foreground">{course.title}</p>
      <CourseForm
        courseId={course.id}
        sections={sections}
        subscriptionPlans={subscriptionPlans}
        isSuperAdmin={isSuperAdmin}
        defaults={{
          title: course.title,
          confirmationTitle: course.confirmationTitle ?? "",
          description: course.description,
          location: course.location,
          scheduleWeekdays: course.scheduleWeekdays.join(","),
          scheduleStart: formatClock(course.scheduleStartMinute),
          scheduleEnd: formatClock(course.scheduleEndMinute),
          priceEuro:
            course.priceCents === 0 && course.childPriceCents != null
              ? ""
              : (course.priceCents / 100).toFixed(2).replace(".", ","),
          childPriceEuro:
            course.childPriceCents == null
              ? ""
              : (course.childPriceCents / 100).toFixed(2).replace(".", ","),
          childMaxAge: String(course.childMaxAge),
          startsAt: course.startsAt
            ? course.startsAt.toISOString().slice(0, 10)
            : "",
          endsAt: course.endsAt
            ? course.endsAt.toISOString().slice(0, 10)
            : "",
          registrationDeadline: course.registrationDeadline
            ? course.registrationDeadline.toISOString().slice(0, 10)
            : "",
          audienceMinAge:
            course.audienceMinAge != null ? String(course.audienceMinAge) : "",
          audienceMaxAge:
            course.audienceMaxAge != null ? String(course.audienceMaxAge) : "",
          maxParticipants:
            course.maxParticipants != null ? String(course.maxParticipants) : "",
          cancelDeadlineDaysBeforeStart:
            course.cancelDeadlineDaysBeforeStart != null
              ? String(course.cancelDeadlineDaysBeforeStart)
              : "",
          published: course.published,
          requiresDocuments: course.requiresDocuments,
          requiresMedicalCertificate: course.requiresMedicalCertificate,
          requiresPassportPhoto: course.requiresPassportPhoto,
          requiresIdFront: course.requiresIdFront,
          requiresIdBack: course.requiresIdBack,
          requiresHealthCard: course.requiresHealthCard,
          allowBankTransfer: course.allowBankTransfer,
          allowWithoutMembership: course.allowWithoutMembership,
          bundledPlanId: course.bundledPlanId ?? "",
          sectionId: course.sectionId ?? sections[0]?.id ?? "",
        }}
      />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/admin/kurse/${course.id}/anmeldungen`}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Anmeldungen & Atteste
        </Link>
      </div>
      <div className="mt-8">
        <DeleteCourseButton
          courseId={course.id}
          canDelete={activeEnrollments === 0}
        />
      </div>
      <Link href="/admin" className="mt-6 inline-block text-sm underline">
        Zurück zur Übersicht
      </Link>
    </div>
  );
}
