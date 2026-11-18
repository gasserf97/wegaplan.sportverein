import { platformLoginAction, platformLogoutAction, createClubAction, openClubAdminAction } from "@/app/actions/platform";
import { ensurePlatformAdmin, getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { clubPublicUrlLabel, requestHostHeader, supportsClubSubdomains } from "@/lib/tenant";
import { PlatformForm } from "@/components/platform-form";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  await ensurePlatformAdmin();
  const admin = await getPlatformAdmin();
  const host = await requestHostHeader().catch(() => "");

  if (!admin) {
    return (
      <main className="mx-auto grid min-h-full w-full max-w-md gap-6 px-4 py-16">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Betreiber
          </p>
          <h1 className="mt-2 text-4xl">Vereine</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nur für den Super-Admin. Der erste Zugang kommt aus
            PLATFORM_ADMIN_USERNAME und PLATFORM_ADMIN_PASSWORD.
          </p>
        </div>
        <PlatformForm
          action={platformLoginAction}
          submitLabel="Anmelden"
          fields={[
            { name: "login", label: "Benutzername oder E-Mail" },
            { name: "password", label: "Passwort", type: "password" },
          ]}
        />
      </main>
    );
  }

  const clubs = await prisma.club.findMany({
    orderBy: { name: "asc" },
    include: {
      hosts: true,
      _count: { select: { users: true } },
    },
  });

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Betreiber
          </p>
          <h1 className="mt-2 text-4xl">Vereine</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Angemeldet als {admin.name}. Einstellungen und Schlüssel sind nur hier sichtbar.
          </p>
        </div>
        <form action={platformLogoutAction}>
          <button type="submit" className="text-sm underline-offset-4 hover:underline">
            Abmelden
          </button>
        </form>
      </div>

      <ul className="grid gap-3">
        {clubs.map((club) => (
          <li key={club.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {club.name}{" "}
                  {!club.active ? (
                    <span className="text-sm text-muted-foreground">(inaktiv)</span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {clubPublicUrlLabel(club.slug, host)} · {club._count.users} Benutzer
                </p>
                {club.hosts.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Zusatz-Hosts: {club.hosts.map((item) => item.host).join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/vereine/${club.id}`}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm"
                >
                  Einstellungen
                </a>
                <form action={openClubAdminAction.bind(null, club.id)}>
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground"
                  >
                    Als Admin öffnen
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-2xl">Neuen Verein anlegen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Slug und der erste Haupt-Admin. Zahlungen und Mail pflegen Sie danach in den Einstellungen.
          {!supportsClubSubdomains()
            ? " Ohne eigene Domain läuft die Vereins-App vorerst als Vorschau auf dieser Host-Adresse (Als Admin öffnen)."
            : null}
        </p>
        <div className="mt-4">
          <PlatformForm
            action={createClubAction}
            submitLabel="Verein anlegen"
            fields={[
              { name: "name", label: "Vereinsname" },
              { name: "slug", label: "Subdomain", hint: "z. B. lajen" },
              { name: "adminName", label: "Name des ersten Admins" },
              { name: "adminEmail", label: "E-Mail des Admins", type: "email" },
              { name: "adminUsername", label: "Benutzername des Admins" },
              { name: "adminPassword", label: "Passwort", type: "password" },
            ]}
          />
        </div>
      </section>
    </main>
  );
}
