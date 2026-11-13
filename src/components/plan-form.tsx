"use client";

import { useActionState, useState } from "react";
import {
  createPlanAction,
  updatePlanAction,
  type PlanDraftFields,
  type PlanFormState,
} from "@/app/actions/subscriptions";
import { COURSE_ACCENTS } from "@/lib/accents";
import { SUBSCRIPTION_INTERVAL_VALUES, intervalMeta } from "@/lib/subscriptions";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SectionOption = { id: string; name: string };

type PlanValues = {
  title: string;
  confirmationTitle: string;
  description: string;
  location: string;
  accent: string;
  priceEuro: string;
  childPriceEuro: string;
  childMaxAge: number;
  audienceMinAge: string;
  audienceMaxAge: string;
  familyBundle: boolean;
  familyPriceEuro: string;
  familyAdults: number;
  familyChildren: number;
  interval: "MONTHLY" | "YEARLY_CALENDAR" | "YEARLY_ROLLING" | "DAILY";
  kind: "MEMBERSHIP" | "ADDON";
  published: boolean;
  autoRenewOffered: boolean;
  sendConfirmationEmail: boolean;
  allowBankTransfer: boolean;
  visibleFrom: string;
  visibleUntil: string;
  sectionId: string;
};

function mergePlanValues(
  defaults: PlanValues | undefined,
  draft: PlanDraftFields | undefined,
) {
  const interval =
    (draft?.interval as PlanValues["interval"] | undefined) ??
    defaults?.interval ??
    "YEARLY_CALENDAR";
  const kind =
    (draft?.kind as PlanValues["kind"] | undefined) ??
    defaults?.kind ??
    "ADDON";

  return {
    title: draft?.title ?? defaults?.title ?? "",
    confirmationTitle:
      draft?.confirmationTitle ?? defaults?.confirmationTitle ?? "",
    description: draft?.description ?? defaults?.description ?? "",
    location: draft?.location ?? defaults?.location ?? "ASC Lajen",
    accent: draft?.accent ?? defaults?.accent ?? "green",
    priceEuro: draft?.priceEuro ?? defaults?.priceEuro ?? "",
    childPriceEuro: draft?.childPriceEuro ?? defaults?.childPriceEuro ?? "",
    childMaxAge: draft?.childMaxAge
      ? Number.parseInt(draft.childMaxAge, 10) || 18
      : (defaults?.childMaxAge ?? 18),
    audienceMinAge: draft?.audienceMinAge ?? defaults?.audienceMinAge ?? "",
    audienceMaxAge: draft?.audienceMaxAge ?? defaults?.audienceMaxAge ?? "",
    familyBundle: draft?.familyBundle ?? defaults?.familyBundle ?? false,
    familyPriceEuro: draft?.familyPriceEuro ?? defaults?.familyPriceEuro ?? "",
    familyAdults: draft?.familyAdults
      ? Number.parseInt(draft.familyAdults, 10) || 2
      : (defaults?.familyAdults ?? 2),
    familyChildren: draft?.familyChildren
      ? Number.parseInt(draft.familyChildren, 10) || 1
      : (defaults?.familyChildren ?? 1),
    interval,
    kind,
    published: draft?.published ?? defaults?.published ?? true,
    autoRenewOffered:
      draft?.autoRenewOffered ?? defaults?.autoRenewOffered ?? false,
    sendConfirmationEmail:
      draft?.sendConfirmationEmail ?? defaults?.sendConfirmationEmail ?? false,
    allowBankTransfer:
      draft?.allowBankTransfer ?? defaults?.allowBankTransfer ?? false,
    visibleFrom: draft?.visibleFrom ?? defaults?.visibleFrom ?? "",
    visibleUntil: draft?.visibleUntil ?? defaults?.visibleUntil ?? "",
    sectionId: draft?.sectionId ?? defaults?.sectionId ?? "",
  };
}

export function PlanForm({
  planId,
  defaults,
  sections,
  allowTestIntervals = false,
}: {
  planId?: string;
  defaults?: PlanValues;
  sections: SectionOption[];
  /** Haupt-Admin: täglich als Testintervall anbieten. */
  allowTestIntervals?: boolean;
}) {
  const boundUpdate = planId ? updatePlanAction.bind(null, planId) : createPlanAction;
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(
    boundUpdate,
    null,
  );
  const draft = state?.fields;
  const values = mergePlanValues(defaults, draft);
  const [familyBundle, setFamilyBundle] = useState(values.familyBundle);
  const formKey = draft
    ? `plan-${draft.title}-${draft.priceEuro}-${draft.sectionId}-${draft.familyBundle}`
    : "plan";

  const { t } = useI18n();
  const showDaily =
    allowTestIntervals || values.interval === "DAILY";
  const intervalOptions = [
    ...SUBSCRIPTION_INTERVAL_VALUES.map((value) => ({
      value,
      label: intervalMeta(value, t).label,
    })),
    ...(showDaily
      ? [
          {
            value: "DAILY" as const,
            label: `${intervalMeta("DAILY", t).label} (Test)`,
          },
        ]
      : []),
  ];

  return (
    <form key={formKey} action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="sectionId">Sektion</Label>
        <select
          id="sectionId"
          name="sectionId"
          defaultValue={values.sectionId || sections[0]?.id}
          required
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Ordnet die Mitgliedschaft der Buchhaltung zu; Zahlung über die
          Zahlungsdaten im Render Environment.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          name="title"
          defaultValue={values.title}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmationTitle">Name auf Bestätigung</Label>
        <Input
          id="confirmationTitle"
          name="confirmationTitle"
          defaultValue={values.confirmationTitle}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          Steht auf der Mitgliedskarte (Vereinsmitgliedschaft) und auf der
          Bestätigung. Das Jahr kommt aus der Gültigkeit (1.1.2027–31.12.2027
          → 2027). {"{year}"} wird durch dasselbe Jahr ersetzt; fehlt der
          Platzhalter, wird das Jahr angehängt.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Beschreibung (optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={6}
          defaultValue={values.description}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <p className="text-sm font-medium">Preisplan</p>
          <p className="text-xs text-muted-foreground">
            Beim Bezahlen wählt die Software automatisch Erwachsenen- oder
            Kinderpreis anhand des hinterlegten Geburtsdatums.
          </p>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="familyBundle"
              checked={familyBundle}
              onChange={(event) => setFamilyBundle(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="font-medium">Familienkarte kombinieren</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Zusätzlich zum Erwachsenen- und Kinderpreis: Passt die Auswahl
                (z. B. 2 Erwachsene + 1 Kind), wird der Familienpreis verrechnet.
                Weitere Personen zahlen den Einzelpreis.
              </span>
            </span>
          </label>
        </div>
        {familyBundle ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="familyPrice">Familienpreis in Euro</Label>
              <Input
                id="familyPrice"
                name="familyPrice"
                inputMode="decimal"
                defaultValue={values.familyPriceEuro}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="familyAdults">Erwachsene inklusive</Label>
              <Input
                id="familyAdults"
                name="familyAdults"
                type="number"
                min={1}
                inputMode="numeric"
                defaultValue={String(values.familyAdults)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="familyChildren">Kinder inklusive</Label>
              <Input
                id="familyChildren"
                name="familyChildren"
                type="number"
                min={1}
                inputMode="numeric"
                defaultValue={String(values.familyChildren)}
                required
              />
            </div>
          </>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="price">Preis Erwachsene in Euro</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={values.priceEuro}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="childPrice">Preis Kinder in Euro</Label>
          <Input
            id="childPrice"
            name="childPrice"
            inputMode="decimal"
            defaultValue={values.childPriceEuro}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="childMaxAge">Kinder bis Alter (Jahre)</Label>
          <Input
            id="childMaxAge"
            name="childMaxAge"
            inputMode="numeric"
            defaultValue={String(values.childMaxAge)}
          />
          <p className="text-xs text-muted-foreground">
            Mindestens einen Preis angeben. Nur Kinderpreis = Karte zeigt nur
            diesen. Unter dem Alter gilt der Kinderpreis (Standard: 18, also bis
            17 Jahre).
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audienceMinAge">Mindestalter (optional)</Label>
          <Input
            id="audienceMinAge"
            name="audienceMinAge"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={values.audienceMinAge}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audienceMaxAge">Höchstalter (optional)</Label>
          <Input
            id="audienceMaxAge"
            name="audienceMaxAge"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={values.audienceMaxAge}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Zielgruppe: Leer lassen = alle Altersgruppen. Beispiele: Kinder bis 18
          Jahre (Höchstalter 18), Erwachsene ab 18 (Mindestalter 18). Die
          Mitgliedschaft erscheint nur, wenn jemand in der Familie dazu passt.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="interval">Mitgliedschaftsintervall</Label>
          <select
            id="interval"
            name="interval"
            defaultValue={values.interval}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {intervalOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Kalenderjahr = immer 1.1.–31.12.; „12 Monate ab Kauf“ = genau ein Jahr
            ab dem Bezahldatum (z. B. Kauf am 8.8. → gültig bis 8.8. im Folgejahr).
            {showDaily
              ? " „Täglich (Test)“ nur für Administratoren – kurze Verlängerungszyklen."
              : null}
          </p>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="kind">Art</Label>
          <select
            id="kind"
            name="kind"
            defaultValue={values.kind}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="MEMBERSHIP">Vereinsmitgliedschaft (Schritt 1, Pflicht)</option>
            <option value="ADDON">
              Zusatzmitgliedschaft (z. B. Tennis-Saisonkarte)
            </option>
          </select>
          <p className="text-xs text-muted-foreground">
            Mitgliedschaften schalten Kurse und Zusatzmitgliedschaften frei.
            Zusatzmitgliedschaften können nur mit gültiger Mitgliedschaft
            gekauft werden.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location">Ort</Label>
          <Input
            id="location"
            name="location"
            defaultValue={values.location}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="accent">Farbe der Karte</Label>
          <select
            id="accent"
            name="accent"
            defaultValue={values.accent}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {Object.entries(COURSE_ACCENTS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={values.published}
          className="size-4 accent-primary"
        />
        Mitgliedschaft veröffentlichen
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="visibleFrom">Sichtbar ab (optional)</Label>
          <Input
            id="visibleFrom"
            name="visibleFrom"
            type="date"
            defaultValue={values.visibleFrom}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="visibleUntil">Sichtbar bis (optional)</Label>
          <Input
            id="visibleUntil"
            name="visibleUntil"
            type="date"
            defaultValue={values.visibleUntil}
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Steuert, wann die Mitgliedschaft im Katalog und auf der Startseite erscheint.
        Leer = unbegrenzt (solange veröffentlicht).
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="autoRenewOffered"
          defaultChecked={values.autoRenewOffered}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Automatische Verlängerung anbieten. Standard: aus. Kundinnen und Kunden
          stimmen bei der ersten Anmeldung zu oder zahlen nur eine Periode.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="allowBankTransfer"
          defaultChecked={values.allowBankTransfer}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Zahlung per Überweisung erlauben. Kreditkarte / Online (Stripe) ist
          immer verfügbar, sobald die Sektion Stripe eingerichtet hat. Standard:
          aus. Automatische Verlängerung per Karte braucht kein Extra-Häkchen.
        </span>
      </label>
      <p className="text-sm text-muted-foreground">
        Zusatzmitgliedschaften erhalten nach der Bezahlung automatisch eine
        Einzahlungsbestätigung als PDF. Bei Vereinsmitgliedschaften wird
        stattdessen ausschließlich die Mitgliedskarte versendet.
      </p>
      {state?.error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending
          ? "Speichern…"
          : planId
            ? "Änderungen speichern"
            : "Mitgliedschaft anlegen"}
      </Button>
    </form>
  );
}
