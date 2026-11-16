import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubEventAdminCard } from "@/components/club-event-admin-card";
import { ClubEventForm } from "@/components/club-event-form";
import { requireAdmin } from "@/lib/auth";
import { clubDayIso, clubEventPhase } from "@/lib/club-events";
import { formatShortDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { sectionListOrderBy } from "@/lib/section-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Events" };

const phaseLabel = {
  upcoming: "Geplant",
  live: "Sichtbar",
  past: "Beendet",
} as const;

export default async function AdminEventsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const [sections, events] = await Promise.all([
    prisma.section.findMany({
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
    prisma.clubEvent.findMany({
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      include: {
        sections: {
          include: { section: { select: { name: true } } },
        },
        _count: { select: { reads: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl text-primary">Events</h1>
      <p className="mt-2 text-muted-foreground">
        Hinweis schreiben oder ein Bild hinzufügen, Zielgruppen wählen und den
        Zeitraum festlegen. Wer auf „Gelesen“ klickt, sieht die Meldung danach
        nicht mehr – zum Beispiel für eine Sitzung oder Versammlung.
      </p>

      <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <ClubEventForm sections={sections} />
      </div>

      <h2 className="mt-10 text-2xl">Veröffentlichte Hinweise</h2>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Noch keine Hinweise.
        </p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {events.map((event) => {
            const phase = clubEventPhase(event.startsAt, event.endsAt);
            const groups = [
              ...(event.audienceAll ? ["Alle"] : []),
              ...(event.audienceAdmins ? ["Hauptadmin"] : []),
              ...(event.audienceClub ? ["Sportverein"] : []),
              ...event.sections.map((item) => `${item.section.name}-Mitglieder`),
            ];
            return (
              <ClubEventAdminCard
                key={event.id}
                sections={sections}
                phase={phase}
                phaseLabel={phaseLabel[phase]}
                startsLabel={formatShortDate(event.startsAt)}
                endsLabel={formatShortDate(event.endsAt)}
                groups={groups}
                readCount={event._count.reads}
                event={{
                  id: event.id,
                  body: event.body,
                  startsOn: clubDayIso(event.startsAt),
                  endsOn: clubDayIso(event.endsAt),
                  audienceAll: event.audienceAll,
                  audienceAdmins: event.audienceAdmins,
                  audienceClub: event.audienceClub,
                  sectionIds: event.sections.map((item) => item.sectionId),
                  imageUrl: event.imageStorageKey
                    ? `/api/events/${event.id}/image`
                    : null,
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
