"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateClubBrandAction,
  updateClubStampAction,
  type ClubLogoState,
} from "@/app/actions/club-profile";
import type { ClubBrand } from "@/lib/club-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SavedNote({ state }: { state: ClubLogoState }) {
  if (state && "error" in state) {
    return <p className="text-sm text-destructive">{state.error}</p>;
  }
  if (state && "ok" in state) {
    return <p className="text-sm text-primary">Gespeichert.</p>;
  }
  return null;
}

export function ClubStampForm({
  stampUrl,
  fallbackUrl,
}: {
  stampUrl: string | null;
  fallbackUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<ClubLogoState, FormData>(
    updateClubStampAction,
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

  const shown = previewUrl ?? stampUrl ?? fallbackUrl;

  return (
    <form action={formAction} className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Der Stempel erscheint nur auf der Einzahlungsbestätigung, links unter
        dem Datum. JPG, PNG oder WebP, höchstens 2 MB. Auf dem PDF werden JPG
        und PNG verwendet.
      </p>
      {shown ? (
        <img
          src={shown}
          alt="Stempel-Vorschau"
          className="h-24 w-auto max-w-full rounded-md bg-background object-contain object-left p-1 ring-1 ring-foreground/10"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Noch kein Stempel. Die Einzahlungsbestätigung bleibt ohne Stempel.
        </p>
      )}
      {!stampUrl && fallbackUrl ? (
        <p className="text-xs text-muted-foreground">
          Angezeigt wird der eingebaute Stempel, solange keiner hochgeladen ist.
        </p>
      ) : null}
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="club-stamp">Stempel-Datei</Label>
        <Input
          id="club-stamp"
          name="stamp"
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
          {pending ? "Speichern…" : "Stempel speichern"}
        </Button>
        {stampUrl ? (
          <Button
            type="submit"
            name="intent"
            value="remove"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Stempel entfernen
          </Button>
        ) : null}
      </div>
      <SavedNote state={state} />
    </form>
  );
}

function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="color"
        name={name}
        defaultValue={defaultValue}
        aria-label={label}
        className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
      />
      <span>{label}</span>
    </label>
  );
}

export function ClubBrandForm({ brand }: { brand: ClubBrand }) {
  const [state, formAction, pending] = useActionState<ClubLogoState, FormData>(
    updateClubBrandAction,
    null,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <p className="text-xs text-muted-foreground">
        Diese Angaben stehen auf der Mitgliedskarte, in der
        Einzahlungsbestätigung, auf der Tennis-Quittung und im Datenschutz.
        Der Text der Schreiben bleibt, nur die Werte werden eingesetzt. Leere
        Felder behalten beim Verein Lajen die bisherigen Angaben. Die
        Sektionsfarben bleiben eigene Farben.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="letterName" label="Name auf Belegen" defaultValue={brand.name} />
        <Field name="namePrimary" label="Briefkopf, erste Zeile" defaultValue={brand.namePrimary} />
        <Field name="nameSecondary" label="Briefkopf, zweite Zeile" defaultValue={brand.nameSecondary} />
        <Field name="president" label="Präsident" defaultValue={brand.president} />
        <Field name="street" label="Straße" defaultValue={brand.street} />
        <Field name="postalCode" label="PLZ" defaultValue={brand.postalCode} />
        <Field name="city" label="Ort" defaultValue={brand.city} />
        <Field name="province" label="Provinz" defaultValue={brand.province} />
        <Field name="taxId" label="Steuernummer" defaultValue={brand.taxId} />
        <Field name="vatId" label="USt-IdNr." defaultValue={brand.vatId} />
        <Field name="legalForm" label="Rechtsform" defaultValue={brand.legalForm} />
        <Field
          name="tennisClubName"
          label="Name auf der Tennis-Quittung"
          defaultValue={brand.tennisClubName}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ColorField name="colorPrimary" label="Primärfarbe der App" defaultValue={brand.colorPrimary} />
        <ColorField name="colorCardStart" label="Karte, Anfang" defaultValue={brand.colorCardStart} />
        <ColorField name="colorCardMid" label="Karte, Mitte und Name" defaultValue={brand.colorCardMid} />
        <ColorField name="colorCardEnd" label="Karte, Ende und Angebot" defaultValue={brand.colorCardEnd} />
      </div>
      <div
        className="h-10 max-w-sm rounded-lg"
        style={{
          background: `linear-gradient(160deg, ${brand.colorCardStart} 0%, ${brand.colorCardMid} 55%, ${brand.colorCardEnd} 100%)`,
        }}
        aria-hidden
      />
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Speichern…" : "Angaben speichern"}
      </Button>
      <SavedNote state={state} />
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} />
    </div>
  );
}
