"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateClubLogoAction,
  type ClubLogoState,
} from "@/app/actions/club-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClubLogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, formAction, pending] = useActionState<ClubLogoState, FormData>(
    updateClubLogoAction,
    null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [trackedState, setTrackedState] = useState(state);
  const saved = state != null && "ok" in state;

  if (state !== trackedState) {
    setTrackedState(state);
    if (saved) setPreviewUrl(null);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shown = previewUrl ?? logoUrl;

  return (
    <form action={formAction} className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Ein Logo für den ganzen Verein. Es ersetzt das Vereinszeichen in der
        Kopfzeile, in der Fußzeile und auf Belegen. JPG, PNG oder WebP,
        höchstens 2 MB. Auf PDF-Belegen werden JPG und PNG verwendet.
      </p>
      {shown ? (
        <img
          src={shown}
          alt="Logo-Vorschau"
          className="h-16 w-auto max-w-full rounded-md bg-background object-contain object-left p-1 ring-1 ring-foreground/10"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Noch kein eigenes Logo. Angezeigt wird das eingebaute Vereinszeichen.
        </p>
      )}
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="club-logo">Logo-Datei</Label>
        <Input
          id="club-logo"
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="text-sm"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreviewUrl((current) => {
              if (current) URL.revokeObjectURL(current);
              return file ? URL.createObjectURL(file) : null;
            });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="save" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Logo speichern"}
        </Button>
        {logoUrl ? (
          <Button
            type="submit"
            name="intent"
            value="remove"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Logo entfernen
          </Button>
        ) : null}
      </div>
      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {saved ? <p className="text-sm text-primary">Gespeichert.</p> : null}
    </form>
  );
}
