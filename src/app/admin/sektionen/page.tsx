import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  SectionAccentForm,
  SectionCreateForm,
  SectionCreditToggle,
  SectionDeleteButton,
  SectionMoveButtons,
  SectionPaymentsForm,
  SectionSettingsGroup,
  SectionStripeSetupGuide,
} from "@/components/section-admin";
import { getAccent, resolveAccent } from "@/lib/accents";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth";
import {
  getSectionStripeStatus,
  resolveSectionBank,
  stripeWebhookEndpointUrl,
} from "@/lib/section-payments";
import { connectAccountForSection } from "@/lib/stripe-connect";
import { sectionListOrderBy } from "@/lib/section-order";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Sektionen" };

export default async function SectionsAdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const sections = await prisma.section.findMany({
    orderBy: sectionListOrderBy,
    include: {
      _count: { select: { members: true, courses: true, admins: true } },
    },
  });

  const webhookUrl = await stripeWebhookEndpointUrl();
  const connect = await connectAccountForSection(null);
  const connectMode = connect.chargesEnabled
    ? "active"
    : connect.accountId
      ? "pending"
      : "off";
  const paymentStatuses = await Promise.all(sections.map(async (section) => ({
    section,
    bankConfigured: Boolean(await resolveSectionBank(section.id)),
    stripeStatus: await getSectionStripeStatus(section.id),
  })));
  const incompleteStripe = paymentStatuses.filter(
    (item) => !item.stripeStatus.fullyReady,
  );
  const incompleteBank = paymentStatuses.filter((item) => !item.bankConfigured);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl text-primary">Sektionen</h1>
          <p className="mt-2 text-muted-foreground">
            Kurs, Auto und Mitgliedschaft brauchen immer eine Sektion. Die
            Kartenfarbe gilt für alle Kurse der Sektion. Logo, Stempel, Adresse
            und Farben stehen unter Verein. Die Sektionseinstellungen sind in
            Darstellung, Guthaben und Zahlung unterteilt. Zahlungsdaten trägt
            der Betreiber in den Vereinseinstellungen ein. Mit ↑/↓ legen Sie
            die Reihenfolge für Dropdowns fest. Sektions-Admins sind
            Admin-Rechte – keine bezahlte Vereinsmitgliedschaft.
          </p>
        </div>
        <Link
          href="/admin/mitglieder"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Mitglieder
        </Link>
      </div>

      {connectMode === "off" && incompleteStripe.length > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Stripe ist unvollständig bei:{" "}
          {incompleteStripe.map((item) => item.section.name).join(", ")}.
          Der Betreiber verbindet den Verein mit Stripe oder trägt die bisherigen
          Schlüssel ein.
        </p>
      ) : null}
      {incompleteBank.length > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Überweisung ist unvollständig bei:{" "}
          {incompleteBank.map((item) => item.section.name).join(", ")}.
          Der Betreiber trägt IBAN und Kontoinhaber in den Vereinseinstellungen ein.
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <SectionCreateForm />
      </div>

      <SectionStripeSetupGuide webhookUrl={webhookUrl} connect={connectMode} />

      <h2 className="mt-10 text-2xl">Bestehende Sektionen</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Reihenfolge gilt für Auswahlfelder bei Kursen, Mitgliedschaften, Plätzen und Fahrzeugen.
      </p>
      {sections.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Noch keine Sektionen. Legen Sie z. B. „Tennis“ an.
        </p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {paymentStatuses.map(({ section, bankConfigured, stripeStatus }, index) => {
            const visual = getAccent(resolveAccent(section.accent));
            return (
              <li
                key={section.id}
                className={cn(
                  "rounded-xl border-l-4 bg-card px-4 py-4 ring-1 ring-foreground/10",
                  visual.borderClass,
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">
                      <span className="mr-2 text-sm text-muted-foreground">
                        {index + 1}.
                      </span>
                      {section.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {section._count.admins} Sektions-Admins ·{" "}
                      {section._count.courses} Kurse
                      {section._count.members > 0
                        ? ` · ${section._count.members} alte Zuordnungen`
                        : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Überweisung:{" "}
                      {bankConfigured ? "hinterlegt" : "fehlt"}{" "}
                      · Stripe:{" "}
                      {connectMode === "active"
                        ? "Vereinskonto"
                        : connectMode === "pending"
                          ? "Einrichtung offen"
                          : stripeStatus.fullyReady
                            ? "hinterlegt"
                            : stripeStatus.secretConfigured
                              ? "unvollständig (Webhook fehlt)"
                              : "fehlt"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <SectionMoveButtons
                      sectionId={section.id}
                      canMoveUp={index > 0}
                      canMoveDown={index < sections.length - 1}
                    />
                    <SectionDeleteButton sectionId={section.id} />
                  </div>
                </div>
                <SectionSettingsGroup title="Darstellung">
                  <SectionAccentForm
                    sectionId={section.id}
                    accent={section.accent}
                  />
                </SectionSettingsGroup>
                <SectionSettingsGroup title="Guthaben">
                  <SectionCreditToggle
                    sectionId={section.id}
                    creditAllowed={section.creditAllowed}
                  />
                </SectionSettingsGroup>
                <SectionSettingsGroup title="Zahlung">
                  <SectionPaymentsForm
                    sectionId={section.id}
                    paymentEnvKey={section.paymentEnvKey ?? ""}
                    bankConfigured={bankConfigured}
                    stripeCheckoutReady={stripeStatus.checkoutReady}
                    stripeWebhookConfigured={stripeStatus.webhookConfigured}
                  />
                </SectionSettingsGroup>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
