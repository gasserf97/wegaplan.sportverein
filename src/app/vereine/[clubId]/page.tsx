import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  refreshSectionStripeStatusAction,
  resendClubAdminInviteAction,
  saveClubSettingsAction,
  saveSectionPaymentAction,
} from "@/app/actions/platform";
import { PlatformForm } from "@/components/platform-form";
import { formatIban } from "@/lib/bank-transfer";
import { decryptSecret } from "@/lib/club-secrets";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { connectWebhookUrl, platformStripeSecret } from "@/lib/stripe-connect";
import { runWithClub } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ClubSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ invite?: string; stripe?: string; m?: string; section?: string }>;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { clubId } = await params;
  const { invite, stripe, m, section: stripeSectionId } = await searchParams;
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
  const webhookUrl = await connectWebhookUrl();
  const platformKeyReady = Boolean(platformStripeSecret());
  const stripeNotice =
    stripe === "zurueck"
      ? "Stripe-Status dieser Sektion wurde übernommen."
      : stripe === "no-platform-key"
        ? "STRIPE_CONNECT_SECRET_KEY fehlt in der Umgebung des Betreibers."
        : stripe === "missing-iban"
          ? "Zuerst Kontoinhaber und IBAN dieser Sektion speichern."
          : stripe === "missing"
            ? "Sektion nicht gefunden."
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
        <p className="mt-1 text-sm text-muted-foreground">
          Standard ist der zentrale Versand unter Vereine. Eigene Mail-Zugangsdaten
          nur bei Bedarf aufklappen.
        </p>
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
            collapsed={{
              title: "Eigener Mail-Versand (optional)",
              hint: "Leer lassen = zentraler Plattform-Versand. Anzeigename bleibt der Vereinsname.",
              open: Boolean(settings.mailProvider?.trim()),
              checks: [
                { name: "clearBrevo", label: "Brevo-Key löschen" },
                { name: "clearResend", label: "Resend-Key löschen" },
                { name: "clearSmtp", label: "SMTP-Passwort löschen" },
              ],
              fields: [
                {
                  name: "mailProvider",
                  label: "Mail-Anbieter (brevo, resend, smtp)",
                  defaultValue: settings.mailProvider,
                  hint: "Leer = zentraler Plattform-Versand",
                },
                {
                  name: "mailFrom",
                  label: "Absender",
                  defaultValue: settings.mailFrom,
                  hint: "Nur bei eigenem Versand nötig",
                },
                {
                  name: "brevoApiKey",
                  label: "Brevo API-Key",
                  type: "password",
                  hint: settings.brevoApiKey
                    ? "Gespeichert. Leer lassen zum Behalten."
                    : undefined,
                },
                {
                  name: "resendApiKey",
                  label: "Resend API-Key",
                  type: "password",
                  hint: settings.resendApiKey
                    ? "Gespeichert. Leer lassen zum Behalten."
                    : undefined,
                },
                { name: "smtpHost", label: "SMTP-Host", defaultValue: settings.smtpHost },
                { name: "smtpPort", label: "SMTP-Port", defaultValue: settings.smtpPort },
                { name: "smtpUser", label: "SMTP-Benutzer", defaultValue: settings.smtpUser },
                {
                  name: "smtpPass",
                  label: "SMTP-Passwort",
                  type: "password",
                  hint: settings.smtpPass
                    ? "Gespeichert. Leer lassen zum Behalten."
                    : undefined,
                },
              ],
            }}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-2xl">Zahlungen je Sektion</h2>
        <p className="text-sm text-muted-foreground">
          Jede Sektion hat ihr eigenes Stripe-Konto. Kartenzahlung und
          Auszahlung gehen auf die IBAN dieser Sektion. Es gibt kein gemeinsames
          Vereinskonto.
        </p>
        {!platformKeyReady ? (
          <p className="text-xs text-amber-700">
            In der Umgebung <code>STRIPE_CONNECT_SECRET_KEY</code> und{" "}
            <code>STRIPE_CONNECT_WEBHOOK_SECRET</code> setzen. Das ist der Schlüssel
            der Plattform. Jede Sektion bekommt danach ein eigenes verbundenes Konto.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Webhook auf verbundene Konten:{" "}
            <code className="break-all text-foreground">{webhookUrl}</code>. Events:{" "}
            <code>account.updated</code>, <code>checkout.session.completed</code>,{" "}
            <code>checkout.session.expired</code>, <code>invoice.paid</code>.
          </p>
        )}
        {club.sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Sektionen. Der Vereins-Admin legt sie an, danach tragen Sie hier die IBAN ein.
          </p>
        ) : (
          club.sections.map((section) => {
            const config = section.paymentConfig;
            const iban = decryptSecret(config?.bankIban ?? "");
            const accountId = config?.stripeAccountId ?? "";
            const chargesEnabled = Boolean(config?.stripeChargesEnabled);
            const payoutLast4 = config?.stripePayoutLast4 ?? "";
            const ibanLast4 = iban.replace(/\s/g, "").slice(-4);
            const payoutMismatch = Boolean(
              payoutLast4 && ibanLast4 && payoutLast4 !== ibanLast4,
            );
            return (
              <div
                id={`section-${section.id}`}
                key={section.id}
                className="scroll-mt-6 rounded-xl border border-border bg-card p-5"
              >
                <h3 className="text-lg">{section.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  IBAN {iban ? "gespeichert" : "fehlt"}
                  {accountId
                    ? chargesEnabled
                      ? " · Kartenzahlung auf dieses Konto"
                      : " · Stripe-Konto angelegt, Einrichtung offen"
                    : " · noch kein eigenes Stripe-Konto"}
                </p>
                {stripeSectionId === section.id && stripeNotice ? (
                  <p className="mt-2 text-sm text-primary">{stripeNotice}</p>
                ) : null}
                {accountId ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Konto <code>{accountId}</code>
                    {config?.stripePayoutsEnabled ? ", Auszahlung aktiv" : ", Auszahlung noch nicht aktiv"}
                    {payoutLast4 ? `, Kontoende ${payoutLast4}` : ""}.
                  </p>
                ) : null}
                {payoutMismatch ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Stripe zahlt auf ein anderes Konto als die IBAN dieser Sektion.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {chargesEnabled ? (
                    <a
                      href={`/vereine/${club.id}/stripe/${section.id}/dashboard`}
                      className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
                    >
                      Stripe-Dashboard öffnen
                    </a>
                  ) : platformKeyReady && iban ? (
                    <a
                      href={`/vereine/${club.id}/stripe/${section.id}/erneuern`}
                      className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
                    >
                      {accountId ? "Einrichtung fortsetzen" : "Stripe-Konto eröffnen"}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
                      disabled
                    >
                      {accountId ? "Einrichtung fortsetzen" : "Stripe-Konto eröffnen"}
                    </button>
                  )}
                  {accountId ? (
                    <form action={refreshSectionStripeStatusAction.bind(null, section.id)}>
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm"
                      >
                        Status aktualisieren
                      </button>
                    </form>
                  ) : null}
                </div>
                {!iban ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Zuerst Kontoinhaber und IBAN speichern. Darauf zahlt Stripe die
                    Kartenzahlungen dieser Sektion aus.
                  </p>
                ) : !platformKeyReady ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Die IBAN ist gespeichert. Stripe-Konto eröffnen bleibt aus, bis
                    in Render <code>STRIPE_CONNECT_SECRET_KEY</code> gesetzt ist.
                  </p>
                ) : null}
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
                        defaultValue: iban ? formatIban(iban) : "",
                      },
                      ...(accountId
                        ? []
                        : [
                            {
                              name: "stripeSecretKey",
                              label: "Stripe Secret Key",
                              type: "password",
                              hint: config?.stripeSecretKey
                                ? "Gespeichert. Leer lassen zum Behalten. Nur ohne Connect-Konto."
                                : "Nur solange diese Sektion kein Connect-Konto hat.",
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
