"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClubEventAction,
  type ClubEventFormState,
} from "@/app/actions/club-events";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function ClubEventForm({
  sections,
}: {
  sections: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ClubEventFormState,
    FormData
  >(createClubEventAction, null);
  const draft = state && "error" in state ? state.fields : undefined;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  function setPreview(next: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setPreviewUrl(next);
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (!(state && "ok" in state)) return;
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreviewUrl(null);
    router.refresh();
  }, [state, router]);

  return (
    <form
      key={state && "ok" in state ? state.id : "new-event"}
      action={formAction}
      className="grid gap-5"
    >
      <div className="grid gap-2">
        <Label htmlFor="event-body">Text</Label>
        <Textarea
          id="event-body"
          name="body"
          rows={6}
          maxLength={4000}
          defaultValue={draft?.body}
          placeholder="Zum Beispiel: Mitgliederversammlung am Donnerstag, 19 Uhr, im Vereinsheim."
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="event-image">Bild</Label>
        <Input
          id="event-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Optional. JPG, PNG oder WebP, höchstens 10 MB. Text oder Bild reicht.
        </p>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Vorschau"
            className="max-h-64 w-full rounded-lg object-contain"
          />
        ) : null}
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Anzeigen für</legend>
        <p className="text-xs text-muted-foreground">
          Hauptadmin sind Personen mit Haupt-Admin-Recht. Sportverein meint die
          aktive Vereinsmitgliedschaft. Sektionen meinen Personen mit aktivem
          Abo dieser Sektion, zum Beispiel Tennis.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="audienceAll"
            defaultChecked={draft?.audienceAll}
            className="size-4 accent-primary"
          />
          Alle
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="audienceAdmins"
            defaultChecked={draft?.audienceAdmins}
            className="size-4 accent-primary"
          />
          Hauptadmin
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="audienceClub"
            defaultChecked={draft?.audienceClub}
            className="size-4 accent-primary"
          />
          Sportverein
        </label>
        {sections.map((section) => (
          <label key={section.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="sectionIds"
              value={section.id}
              defaultChecked={draft?.sectionIds.includes(section.id)}
              className="size-4 accent-primary"
            />
            {section.name}-Mitglieder
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="event-starts" required>
            Veröffentlichen von
          </Label>
          <Input
            id="event-starts"
            name="startsOn"
            type="date"
            required
            defaultValue={draft?.startsOn}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="event-ends" required>
            Veröffentlichen bis
          </Label>
          <Input
            id="event-ends"
            name="endsOn"
            type="date"
            required
            defaultValue={draft?.endsOn}
          />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Veröffentlichen"}
        </Button>
        {state && "error" in state ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state && "ok" in state ? (
          <p className="text-sm text-primary">Hinweis veröffentlicht.</p>
        ) : null}
      </div>
    </form>
  );
}
