import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CourseForm } from "@/components/course-form";
import { getManageableSectionsForCurrentUser } from "@/app/actions/courses";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Neuen Kurs anlegen" };

export default async function NewCoursePage() {
  const sections = await getManageableSectionsForCurrentUser();
  if (sections.length === 0) {
    redirect("/admin");
  }

  const user = await getCurrentUser();
  const isSuperAdmin = user?.role === "ADMIN";
  const subscriptionPlans = isSuperAdmin
    ? await prisma.subscriptionPlan.findMany({
        where: { kind: "MEMBERSHIP", interval: "YEARLY_CALENDAR" },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl">Neuen Kurs anlegen</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Wählen Sie die Sektion und legen Sie den Kurs an. Er erscheint im Katalog,
        sofern er veröffentlicht ist.
      </p>
      <CourseForm
        sections={sections}
        subscriptionPlans={subscriptionPlans}
        isSuperAdmin={isSuperAdmin}
      />
      <Link href="/admin" className="mt-6 inline-block text-sm underline">
        Zurück zur Übersicht
      </Link>
    </div>
  );
}
