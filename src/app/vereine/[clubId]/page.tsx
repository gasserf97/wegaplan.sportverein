import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  openClubStripeDashboardAction,
  openClubStripeOnboardingAction,
  refreshClubStripeStatusAction,
  resendClubAdminInviteAction,
  saveClubSettingsAction,
  saveSectionPaymentAction,
} from "@/app/actions/platform";
import { PlatformForm } from "@/components/platform-form";
import { decryptSecret } from "@/lib/club-secrets";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import {
  connectAccountForClub,
  connectWebhookUrl,
  platformStripeSecret,
} from "@/lib/stripe-connect";
import { runWithClub } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ClubSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ invite?: string; stripe?: string; m?: string }>;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId } = await params;
  const { invite, stripe, m } = await searchParams;
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
  const firstAdmin = await runWithClub(club.id, () =>
    prisma.user.findFirst({
      where: { role: "ADMIN", canLogin: true },
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        emailVerifiedAt: true,
        emailVerifyToken: true,
      },
    }),
  );
  const invitePending = Boolean(
    firstAdmin && (!firstAdmin.emailVerifiedAt || firstAdmin.emailVerifyToken),
  );
  const connect = await connectAccountForClub(club.id);
  const webhookUrl = await connectWebhookUrl();
  const platformKeyReady = Boolean(platformStripeSecret());
  const stripeNotice =
    stripe === "zurueck"
      ? "Stripe-Status wurde übernommen."
      : stripe === "no-platform-key"
        ? "STRIPE_CONNECT_SECRET_KEY fehlt in der Umgebung des Betreibers."
        : stripe === "missing"
          ? "Für diesen Verein ist noch kein Stripe-Konto angelegt."
          : stripe === "stripe"
            ? m || "Stripe hat die Anfrage abgelehnt."
            : "";

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
        {invite === "sent" ? (
          <p className="mt-3 text-sm text-primary">
            Einladungs-E-Mail wurde erneut gesendet
            {firstAdmin?.email ? ` an ${firstAdmin.email}` : ""}.
          </p>
        ) : null}
        {invite === "error" ? (
          <p className="mt-3 text-sm text-destructive">
            Einladung konnte nicht gesendet werden. Bitte Mail-Einstellungen prüfen
            (Brevo/Resend/SMTP) und erneut versuchen.
          </p>
        ) : null}
      </div>

      {invitePending && firstAdmin ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-2xl">Admin-Einladung</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {firstAdmin.email} hat die Registrierung noch nicht abgeschlossen. Bei Bedarf den
            Bestätigungslink erneut senden (wie bei der normalen Registrierung).
          </p>
          <form action={resendClubAdminInviteAction.bind(null, club.id)} className="mt-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
            >
              Einladung erneut senden
            </button>
          </form>
        </section>
      ) : null}

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
                label: "Vorführ-Modus (Testkarte, solange kein Stripe-Konto verbunden ist)",
                defaultChecked: settings.showcaseMode,
              },
              { name: "clearBrevo", label: "Brevo-Key löschen" },
              { name: "clearResend", label: "Resend-Key löschen" },
              { name: "clearSmtp", label: "SMTP-Passwort löschen" },
            ]}
            fields={[
              { name: "name", label: "Name", defaultValue: club.name },
              {
                name: "slug",
                label: "Subdomain",
                defaultValue: club.slug,
                hint: "nur a–z, Umlaute werden zu ae/oe/ue",
              },
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

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-2xl">Stripe-Konto des Vereins</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ein Express-Konto für den ganzen Verein. Kartenzahlungen aller Sektionen
          landen dort. Stripe zahlt auf das Bankkonto aus, das der Verein bei der
          Einrichtung angibt. Die IBANs der Sektionen bleiben für Überweisungen.
          Ein negativer Saldo aus diesen Kartenzahlungen bleibt am Plattformkonto.
        </p>
        {stripeNotice ? (
          <p className="mt-3 text-sm text-primary">{stripeNotice}</p>
        ) : null}
        <p className="mt-3 text-sm">
          {connect.chargesEnabled
            ? "Kartenzahlung ist freigeschaltet."
            : connect.accountId
              ? "Konto angelegt. Die Einrichtung bei Stripe ist noch nicht abgeschlossen."
              : "Noch kein Stripe-Konto."}
          {connect.accountId ? (
            <>
              {" "}
              Konto <code className="text-xs">{connect.accountId}</code>
              {connect.payoutsEnabled ? ", Auszahlung aktiv" : ", Auszahlung noch nicht aktiv"}.
            </>
          ) : null}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {connect.chargesEnabled ? (
            <form action={openClubStripeDashboardAction.bind(null, club.id)}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
              >
                Stripe-Dashboard öffnen
              </button>
            </form>
          ) : (
            <form action={openClubStripeOnboardingAction.bind(null, club.id)}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
                disabled={!platformKeyReady}
              >
                {connect.accountId ? "Einrichtung fortsetzen" : "Stripe-Konto eröffnen"}
              </button>
            </form>
          )}
          {connect.accountId ? (
            <form action={refreshClubStripeStatusAction.bind(null, club.id)}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm"
              >
                Status aktualisieren
              </button>
            </form>
          ) : null}
        </div>
        {!platformKeyReady ? (
          <p className="mt-3 text-xs text-amber-700">
            In der Umgebung <code>STRIPE_CONNECT_SECRET_KEY</code> und{" "}
            <code>STRIPE_CONNECT_WEBHOOK_SECRET</code> setzen. Das ist der Schlüssel
            der Plattform, nicht der eines Vereins.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Im Stripe-Dashboard der Plattform einen Webhook auf verbundene Konten legen:{" "}
          <code className="break-all text-foreground">{webhookUrl}</code>. Events:{" "}
          <code>account.updated</code>, <code>checkout.session.completed</code>,{" "}
          <code>checkout.session.expired</code>, <code>invoice.paid</code>.
        </p>
      </section>

      <section className="grid gap-4">
        <h2 className="text-2xl">Zahlungen je Sektion</h2>
        <p className="text-sm text-muted-foreground">
          IBAN und Kontoinhaber gelten für Überweisungen dieser Sektion.
          {connect.accountId
            ? " Kartenzahlungen laufen über das Vereinskonto oben."
            : " Ohne Connect-Konto kann hier weiterhin ein eigener Stripe-Schlüssel hinterlegt werden."}
        </p>
        {club.sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Sektionen. Der Vereins-Admin legt sie an, danach tragen Sie hier die IBAN ein.
          </p>
        ) : (
          club.sections.map((section) => {
            const config = section.paymentConfig;
            return (
              <div key={section.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-lg">{section.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  IBAN {config && decryptSecret(config.bankIban) ? "gespeichert" : "fehlt"}
                  {connect.accountId ? (
                    " · Karte über das Vereinskonto"
                  ) : (
                    <>
                      {" "}
                      · Stripe {config && decryptSecret(config.stripeSecretKey) ? "gespeichert" : "fehlt"} · Webhook{" "}
                      {config && decryptSecret(config.stripeWebhookSecret) ? "gespeichert" : "fehlt"}
                    </>
                  )}
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
                      ...(connect.accountId
                        ? []
                        : [
                            {
                              name: "stripeSecretKey",
                              label: "Stripe Secret Key",
                              type: "password",
                              hint: config?.stripeSecretKey
                                ? "Gespeichert. Leer lassen zum Behalten."
                                : undefined,
                            },
                            {
                              name: "stripeWebhookSecret",
                              label: "Stripe Webhook Secret",
                              type: "password",
                              hint: config?.stripeWebhookSecret
                                ? "Gespeichert. Leer lassen zum Behalten."
                                : undefined,
                            },
                          ]),
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
