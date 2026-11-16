"use client";

import { useState } from "react";
import {
  ClubEventForm,
  type ClubEventFormValues,
} from "@/components/club-event-form";
import { DeleteClubEventButton } from "@/components/delete-club-event-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ClubEventAdminCard({
  event,
  sections,
  phaseLabel,
  startsLabel,
  endsLabel,
  groups,
  readCount,
  phase,
}: {
  event: ClubEventFormValues;
  sections: { id: string; name: string }[];
  phaseLabel: string;
  startsLabel: string;
  endsLabel: string;
  groups: string[];
  readCount: number;
  phase: "upcoming" | "live" | "past";
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={phase === "live" ? "default" : "secondary"}>
          {phaseLabel}
        </Badge>
        <p className="text-sm text-muted-foreground">
          {startsLabel} – {endsLabel}
        </p>
      </div>
      {event.imageUrl && !editing ? (
        <img
          src={event.imageUrl}
          alt=""
          className="mt-3 max-h-64 w-full rounded-lg object-contain"
        />
      ) : null}
      {event.body.trim() && !editing ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{event.body}</p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        {groups.join(", ") || "Keine Gruppe"}
        {" · "}
        {readCount} {readCount === 1 ? "hat gelesen" : "haben gelesen"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? "Schließen" : "Bearbeiten"}
        </Button>
        <DeleteClubEventButton eventId={event.id} />
      </div>
      {editing ? (
        <div className="mt-5 border-t border-foreground/10 pt-5">
          <ClubEventForm
            sections={sections}
            event={event}
            onSaved={() => setEditing(false)}
          />
        </div>
      ) : null}
    </li>
  );
}
