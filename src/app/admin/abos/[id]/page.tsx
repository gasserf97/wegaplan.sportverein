import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlanForm } from "@/components/plan-form";
import { getManageableSectionsForCurrentUser } from "@/app/actions/courses";
import { requireCourseManager } from "@/lib/auth";
import { canManagePlan } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeInterval } from "@/lib/subscriptions";

export const metadata: Metadata = { title: "Mitgliedschaft bearbeiten" };

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const manager = await requireCourseManager();
  if (!manager) redirect("/anmelden?next=/admin/abos");

  const { id } = await params;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) notFound();

  if (!(await canManagePlan(manager.id, plan))) {
    redirect("/admin/abos");
  }

  const sections = await getManageableSectionsForCurrentUser();
  if (sections.length === 0) notFound();

  const interval = normalizeInterval(plan.interval);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl">Mitgliedschaft bearbeiten</h1>
      <p className="mt-2 mb-8 text-muted-foreground">{plan.title}</p>
      <PlanForm
        planId={plan.id}
        sections={sections}
        allowTestIntervals={manager.role === "ADMIN"}
        defaults={{
          title: plan.title,
          confirmationTitle: plan.confirmationTitle ?? "",
          description: plan.description,
          location: plan.location,
          accent: plan.accent,
          priceEuro:
            plan.priceCents === 0 && plan.childPriceCents != null
              ? ""
              : (plan.priceCents / 100).toFixed(2).replace(".", ","),
          childPriceEuro:
            plan.childPriceCents == null
              ? ""
              : (plan.childPriceCents / 100).toFixed(2).replace(".", ","),
          childMaxAge: plan.childMaxAge,
          audienceMinAge:
            plan.audienceMinAge != null ? String(plan.audienceMinAge) : "",
          audienceMaxAge:
            plan.audienceMaxAge != null ? String(plan.audienceMaxAge) : "",
          familyBundle: plan.pricingMode === "FAMILY_BUNDLE",
          familyPriceEuro:
            plan.familyPriceCents == null
              ? ""
              : (plan.familyPriceCents / 100).toFixed(2).replace(".", ","),
          familyAdults: plan.familyAdults ?? 2,
          familyChildren: plan.familyChildren ?? 1,
          interval:
            interval === "DAILY" ||
            interval === "MONTHLY" ||
            interval === "YEARLY_CALENDAR" ||
            interval === "YEARLY_ROLLING"
              ? interval
              : "YEARLY_ROLLING",
          kind: plan.kind,
          published: plan.published,
          autoRenewOffered: plan.autoRenewOffered,
          sendConfirmationEmail: plan.sendConfirmationEmail,
          allowBankTransfer: plan.allowBankTransfer,
          visibleFrom: plan.visibleFrom
            ? plan.visibleFrom.toISOString().slice(0, 10)
            : "",
          visibleUntil: plan.visibleUntil
            ? plan.visibleUntil.toISOString().slice(0, 10)
            : "",
          sectionId: plan.sectionId ?? sections[0]?.id ?? "",
        }}
      />
      <div className="mt-6">
        <Link
          href={`/admin/abos/${plan.id}/anmeldungen`}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Anmeldungen
        </Link>
      </div>
      <Link href="/admin/abos" className="mt-6 inline-block text-sm underline">
        Zurück zur Übersicht
      </Link>
    </div>
  );
}
