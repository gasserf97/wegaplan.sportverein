import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveClubSettingsAction, saveSectionPaymentAction } from "@/app/actions/platform";
import { PlatformForm } from "@/components/platform-form";
import { decryptSecret } from "@/lib/club-secrets";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubSettingsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId } = await params;
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      settings: true,
      hosts: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { paymentConfig: true },
      },
    },
  });
  if (!club || !club.settings) notFound();
  const settings = club.settings;
  const save = saveClubSettingsAction.bind(null, club.id);

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-12">
      <div>
        <Link href="/vereine" className="text-sm text-primary underline-offset-4 hover:underline">
          Alle Vereine
        </Link>
        <h1 className="mt-3 text-4xl">{club.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Diese Werte gelten nur für diesen Verein. Leere Geheimnis-Felder bleiben unverändert.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-2xl">Verein und Versand</h2>
        <div className="mt-4">
          <PlatformForm
            action={save}
            submitLabel="Einstellungen speichern"
            checks={[
              { name: "active", label: "Verein aktiv", defaultChecked: club.active },
              {
                name: "showcaseMode",
                label: "Vorführ-Modus (Testkarte, solange kein Stripe-Schlüssel gesetzt ist)",
                defaultChecked: settings.showcaseMode,
              },
              { name: "clearBrevo", label: "Brevo-Key löschen" },
              { name: "clearResend", label: "Resend-Key löschen" },
              { name: "clearSmtp", label: "SMTP-Passwort löschen" },
            ]}
            fields={[
              { name: "name", label: "Name", defaultValue: club.name },
              { name: "slug", label: "Subdomain", defaultValue: club.slug },
              {
                name: "hosts",
                label: "Zusätzliche Hosts",
                defaultValue: club.hosts.map((host) => host.host).join(", "),
                hint: "Komma-getrennt, z. B. app.asclajen.com",
              },
              { name: "impressumUrl", label: "Impressum-URL", defaultValue: settings.impressumUrl },
              { name: "mailProvider", label: "Mail-Anbieter (brevo, resend, smtp)", defaultValue: settings.mailProvider },
              { name: "mailFrom", label: "Absender", defaultValue: settings.mailFrom },
              {
                name: "brevoApiKey",
                label: "Brevo API-Key",
                type: "password",
                hint: settings.brevoApiKey ? "Gespeichert. Leer lassen zum Behalten." : undefined,
              },
              {
                name: "resendApiKey",
                label: "Resend API-Key",
                type: "password",
                hint: settings.resendApiKey ? "Gespeichert. Leer lassen zum Behalten." : undefined,
              },
              { name: "smtpHost", label: "SMTP-Host", defaultValue: settings.smtpHost },
              { name: "smtpPort", label: "SMTP-Port", defaultValue: settings.smtpPort },
              { name: "smtpUser", label: "SMTP-Benutzer", defaultValue: settings.smtpUser },
              {
                name: "smtpPass",
                label: "SMTP-Passwort",
                type: "password",
                hint: settings.smtpPass ? "Gespeichert. Leer lassen zum Behalten." : undefined,
              },
              {
                name: "registrationBackupEmail",
                label: "Backup-E-Mail",
                defaultValue: settings.registrationBackupEmail,
              },
              {
                name: "supportTicketNotifyEmail",
                label: "Ticket-Benachrichtigung",
                defaultValue: settings.supportTicketNotifyEmail,
              },
              { name: "stripeFeePercent", label: "Stripe-Gebühr Prozent", defaultValue: settings.stripeFeePercent },
              { name: "stripeFeeFixedCents", label: "Stripe-Gebühr Fixbetrag in Cent", defaultValue: settings.stripeFeeFixedCents },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-2xl">Zahlungen je Sektion</h2>
        {club.sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Sektionen. Der Vereins-Admin legt sie an, danach tragen Sie hier IBAN und Stripe ein.
          </p>
        ) : (
          club.sections.map((section) => {
            const config = section.paymentConfig;
            return (
              <div key={section.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-lg">{section.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  IBAN {config && decryptSecret(config.bankIban) ? "gespeichert" : "fehlt"} · Stripe{" "}
                  {config && decryptSecret(config.stripeSecretKey) ? "gespeichert" : "fehlt"} · Webhook{" "}
                  {config && decryptSecret(config.stripeWebhookSecret) ? "gespeichert" : "fehlt"}
                </p>
                <div className="mt-3">
                  <PlatformForm
                    action={saveSectionPaymentAction.bind(null, section.id)}
                    submitLabel="Zahlungsdaten speichern"
                    fields={[
                      {
                        name: "bankAccountHolder",
                        label: "Kontoinhaber",
                        defaultValue: config?.bankAccountHolder ?? "",
                      },
                      {
                        name: "bankIban",
                        label: "IBAN",
                        hint: config?.bankIban ? "Gespeichert. Leer lassen zum Behalten." : undefined,
                      },
                      {
                        name: "stripeSecretKey",
                        label: "Stripe Secret Key",
                        type: "password",
                        hint: config?.stripeSecretKey ? "Gespeichert. Leer lassen zum Behalten." : undefined,
                      },
                      {
                        name: "stripeWebhookSecret",
                        label: "Stripe Webhook Secret",
                        type: "password",
                        hint: config?.stripeWebhookSecret
                          ? "Gespeichert. Leer lassen zum Behalten."
                          : undefined,
                      },
                    ]}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
