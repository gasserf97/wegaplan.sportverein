"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClubEventAction,
  updateClubEventAction,
  type ClubEventFormState,
} from "@/app/actions/club-events";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export type ClubEventFormValues = {
  id: string;
  body: string;
  startsOn: string;
  endsOn: string;
  audienceAll: boolean;
  audienceAdmins: boolean;
  audienceClub: boolean;
  sectionIds: string[];
  imageUrl: string | null;
};

export function ClubEventForm({
  sections,
  event,
  onSaved,
}: {
  sections: { id: string; name: string }[];
  event?: ClubEventFormValues;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ClubEventFormState,
    FormData
  >(event ? updateClubEventAction : createClubEventAction, null);
  const draft = state && "error" in state ? state.fields : undefined;
  const values = draft ?? event;
  const fieldId = event?.id ?? "new";
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const previewRef = useRef<string | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

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
    setRemoveImage(false);
    onSavedRef.current?.();
    router.refresh();
  }, [state, router]);

  return (
    <form
      key={
        state && "ok" in state
          ? `${event?.id ?? "new"}-${state.id}`
          : (event?.id ?? "new-event")
      }
      action={formAction}
      className="grid gap-5"
    >
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
      <div className="grid gap-2">
        <Label htmlFor={`event-body-${fieldId}`}>Text</Label>
        <Textarea
          id={`event-body-${fieldId}`}
          name="body"
          rows={6}
          maxLength={4000}
          defaultValue={values?.body}
          placeholder="Zum Beispiel: Mitgliederversammlung am Donnerstag, 19 Uhr, im Vereinsheim."
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`event-image-${fieldId}`}>Bild</Label>
        <Input
          id={`event-image-${fieldId}`}
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="text-sm"
          onChange={(change) => {
            const file = change.target.files?.[0];
            setRemoveImage(false);
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Optional. JPG, PNG oder WebP, höchstens 10 MB. Text oder Bild reicht.
        </p>
        {event?.imageUrl && !previewUrl ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="removeImage"
              className="size-4 accent-primary"
              checked={removeImage}
              onChange={(change) => setRemoveImage(change.target.checked)}
            />
            Bild entfernen
          </label>
        ) : null}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Vorschau"
            className="max-h-64 w-full rounded-lg object-contain"
          />
        ) : event?.imageUrl && !removeImage ? (
          <img
            src={event.imageUrl}
            alt=""
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
            defaultChecked={values?.audienceAll}
            className="size-4 accent-primary"
          />
          Alle
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="audienceAdmins"
            defaultChecked={values?.audienceAdmins}
            className="size-4 accent-primary"
          />
          Hauptadmin
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="audienceClub"
            defaultChecked={values?.audienceClub}
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
              defaultChecked={values?.sectionIds.includes(section.id)}
              className="size-4 accent-primary"
            />
            {section.name}-Mitglieder
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`event-starts-${fieldId}`} required>
            Veröffentlichen von
          </Label>
          <Input
            id={`event-starts-${fieldId}`}
            name="startsOn"
            type="date"
            required
            defaultValue={values?.startsOn}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`event-ends-${fieldId}`} required>
            Veröffentlichen bis
          </Label>
          <Input
            id={`event-ends-${fieldId}`}
            name="endsOn"
            type="date"
            required
            defaultValue={values?.endsOn}
          />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern…" : event ? "Speichern" : "Veröffentlichen"}
        </Button>
        {state && "error" in state ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state && "ok" in state ? (
          <p className="text-sm text-primary">
            {event ? "Hinweis gespeichert." : "Hinweis veröffentlicht."}
          </p>
        ) : null}
      </div>
    </form>
  );
}
