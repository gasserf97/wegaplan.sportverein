import { ClubEventNotice } from "@/components/mark-club-event-read-button";
import { listVisibleClubEvents } from "@/lib/club-events";
import { getServerI18n } from "@/lib/i18n";

export async function ClubEventBanner({ userId }: { userId: string }) {
  const events = await listVisibleClubEvents(userId);
  if (events.length === 0) return null;

  const { t } = await getServerI18n();

  return (
    <div className="border-b border-border bg-[#f8f8f8]">
      <div className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-4 sm:px-6">
        {events.map((event) => (
          <ClubEventNotice
            key={event.id}
            eventId={event.id}
            body={event.body}
            imageUrl={
              event.imageStorageKey ? `/api/events/${event.id}/image` : null
            }
            imageAlt={t("events.imageAlt")}
            label={t("events.read")}
            pendingLabel={t("events.reading")}
          />
        ))}
      </div>
    </div>
  );
}
