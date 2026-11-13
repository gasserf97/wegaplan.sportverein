import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubEventForm } from "@/components/club-event-form";
import { DeleteClubEventButton } from "@/components/delete-club-event-button";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth";
import { clubEventPhase } from "@/lib/club-events";
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
              <li
                key={event.id}
                className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={phase === "live" ? "default" : "secondary"}>
                    {phaseLabel[phase]}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {formatShortDate(event.startsAt)} –{" "}
                    {formatShortDate(event.endsAt)}
                  </p>
                </div>
                {event.imageStorageKey ? (
                  <img
                    src={`/api/events/${event.id}/image`}
                    alt=""
                    className="mt-3 max-h-64 w-full rounded-lg object-contain"
                  />
                ) : null}
                {event.body.trim() ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                    {event.body}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {groups.join(", ") || "Keine Gruppe"}
                  {" · "}
                  {event._count.reads}{" "}
                  {event._count.reads === 1 ? "hat gelesen" : "haben gelesen"}
                </p>
                <div className="mt-4">
                  <DeleteClubEventButton eventId={event.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
