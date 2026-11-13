import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanForm } from "@/components/plan-form";
import { getManageableSectionsForCurrentUser } from "@/app/actions/courses";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Neue Mitgliedschaft anlegen" };

export default async function NewPlanPage() {
  const user = await getCurrentUser();
  const sections = await getManageableSectionsForCurrentUser();
  if (sections.length === 0) {
    redirect("/admin/abos");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl">Neue Mitgliedschaft anlegen</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Mitgliedschaften und Saisonkarten mit Preisplan für Erwachsene und
        Kinder. Das Alter kommt aus dem Geburtsdatum im Konto.
      </p>
      <PlanForm
        sections={sections}
        allowTestIntervals={user?.role === "ADMIN"}
      />
      <Link href="/admin/abos" className="mt-6 inline-block text-sm underline">
        Zurück zur Übersicht
      </Link>
    </div>
  );
}
