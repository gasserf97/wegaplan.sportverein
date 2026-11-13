"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createCourseAction,
  toggleCoursePublishedAction,
  updateCourseAction,
  type CourseDraftFields,
  type CourseFormState,
} from "@/app/actions/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SectionOption = { id: string; name: string };
type PlanOption = { id: string; title: string };

type CourseValues = CourseDraftFields;

function mergeCourseValues(
  defaults: CourseValues | undefined,
  draft: CourseDraftFields | undefined,
): CourseValues {
  return {
    title: draft?.title ?? defaults?.title ?? "",
    confirmationTitle:
      draft?.confirmationTitle ?? defaults?.confirmationTitle ?? "",
    description: draft?.description ?? defaults?.description ?? "",
    location: draft?.location ?? defaults?.location ?? "",
    scheduleWeekdays:
      draft?.scheduleWeekdays ?? defaults?.scheduleWeekdays ?? "",
    scheduleStart: draft?.scheduleStart ?? defaults?.scheduleStart ?? "",
    scheduleEnd: draft?.scheduleEnd ?? defaults?.scheduleEnd ?? "",
    priceEuro: draft?.priceEuro ?? defaults?.priceEuro ?? "",
    childPriceEuro:
      draft?.childPriceEuro ?? defaults?.childPriceEuro ?? "",
    childMaxAge: draft?.childMaxAge ?? defaults?.childMaxAge ?? "18",
    startsAt: draft?.startsAt ?? defaults?.startsAt ?? "",
    endsAt: draft?.endsAt ?? defaults?.endsAt ?? "",
    registrationDeadline:
      draft?.registrationDeadline ?? defaults?.registrationDeadline ?? "",
    audienceMinAge: draft?.audienceMinAge ?? defaults?.audienceMinAge ?? "",
    audienceMaxAge: draft?.audienceMaxAge ?? defaults?.audienceMaxAge ?? "",
    maxParticipants: draft?.maxParticipants ?? defaults?.maxParticipants ?? "",
    cancelDeadlineDaysBeforeStart:
      draft?.cancelDeadlineDaysBeforeStart ??
      defaults?.cancelDeadlineDaysBeforeStart ??
      "",
    published: draft?.published ?? defaults?.published ?? true,
    requiresDocuments:
      draft?.requiresDocuments ??
      defaults?.requiresDocuments ??
      draft?.requiresMedicalCertificate ??
      defaults?.requiresMedicalCertificate ??
      false,
    requiresMedicalCertificate:
      draft?.requiresMedicalCertificate ??
      defaults?.requiresMedicalCertificate ??
      false,
    requiresPassportPhoto:
      draft?.requiresPassportPhoto ?? defaults?.requiresPassportPhoto ?? false,
    requiresIdFront:
      draft?.requiresIdFront ?? defaults?.requiresIdFront ?? false,
    requiresIdBack: draft?.requiresIdBack ?? defaults?.requiresIdBack ?? false,
    requiresHealthCard:
      draft?.requiresHealthCard ?? defaults?.requiresHealthCard ?? false,
    allowBankTransfer:
      draft?.allowBankTransfer ?? defaults?.allowBankTransfer ?? false,
    allowWithoutMembership:
      draft?.allowWithoutMembership ??
      defaults?.allowWithoutMembership ??
      false,
    bundledPlanId: draft?.bundledPlanId ?? defaults?.bundledPlanId ?? "",
    sectionId: draft?.sectionId ?? defaults?.sectionId ?? "",
  };
}

export function CourseForm({
  courseId,
  defaults,
  sections,
  subscriptionPlans = [],
  isSuperAdmin = false,
}: {
  courseId?: string;
  defaults?: CourseValues;
  sections: SectionOption[];
  subscriptionPlans?: PlanOption[];
  isSuperAdmin?: boolean;
}) {
  const boundUpdate = courseId
    ? updateCourseAction.bind(null, courseId)
    : createCourseAction;
  const [state, formAction, pending] = useActionState<CourseFormState, FormData>(
    boundUpdate,
    null,
  );
  const draft = state?.fields;
  const values = mergeCourseValues(defaults, draft);
  const formKey = draft
    ? `course-${draft.title}-${draft.priceEuro}-${draft.childPriceEuro}-${draft.sectionId}-${draft.bundledPlanId}-${draft.requiresDocuments}`
    : "course";
  const [requiresDocuments, setRequiresDocuments] = useState(
    values.requiresDocuments,
  );
  const [docsFormKey, setDocsFormKey] = useState(formKey);
  if (docsFormKey !== formKey) {
    setDocsFormKey(formKey);
    setRequiresDocuments(values.requiresDocuments);
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-5"
      onSubmit={(event) => {
        if (!isSuperAdmin) return;
        const form = event.currentTarget;
        const selected = new FormData(form).get("bundledPlanId");
        const planId = typeof selected === "string" ? selected.trim() : "";
        if (!planId) return;
        const planTitle =
          subscriptionPlans.find((plan) => plan.id === planId)?.title ??
          "die gewählte Mitgliedschaft";
        const ok = window.confirm(
          `Sicher, dass mit diesem Kurskauf auch die Folgemitgliedschaft „${planTitle}“ erworben werden soll? Sie gilt nach Ende der laufenden Mitgliedschaft beziehungsweise ab dem nächsten Kalenderjahr.`,
        );
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="sectionId" required>
          Sektion
        </Label>
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
          Nur Sektions-Admins können Kurse für ihre Sektion anlegen. Die
          Kartenfarbe kommt von der Sektion. Zahlung läuft über die
          Zahlungsdaten im Render Environment.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="title" required>
          Titel
        </Label>
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
          Optional für Einzahlungsbestätigung. Leer gelassen wird der Titel
          verwendet. {"{year}"} wird durch das Kursjahr ersetzt.
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
            defaultValue={values.childMaxAge}
          />
          <p className="text-xs text-muted-foreground">
            Mindestens einen Preis angeben. Nur Kinderpreis = Karte zeigt nur
            diesen. Unter dem Alter gilt der Kinderpreis (Standard: 18, also bis
            17 Jahre).
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location">Ort (optional)</Label>
          <Input
            id="location"
            name="location"
            defaultValue={values.location}
          />
        </div>
        <fieldset className="grid gap-3 sm:col-span-2">
          <legend className="text-sm font-medium">Kurszeit (optional)</legend>
          <div className="flex flex-wrap gap-3">
            {(
              [
                [1, "Mo"],
                [2, "Di"],
                [3, "Mi"],
                [4, "Do"],
                [5, "Fr"],
                [6, "Sa"],
                [7, "So"],
              ] as const
            ).map(([day, label]) => (
              <label key={day} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="scheduleWeekday"
                  value={day}
                  defaultChecked={values.scheduleWeekdays
                    .split(",")
                    .includes(String(day))}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="scheduleStart">Beginn</Label>
              <Input
                id="scheduleStart"
                name="scheduleStart"
                type="time"
                defaultValue={values.scheduleStart}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduleEnd">Ende</Label>
              <Input
                id="scheduleEnd"
                name="scheduleEnd"
                type="time"
                defaultValue={values.scheduleEnd}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Zum Beispiel Mittwoch, 19:30–21:00. Auf der Kurskarte steht dann
            „Mittwochs 19:30–21:00“. Sind Start- und Enddatum gesetzt, zeigt die
            Karte außerdem, wie viele Einheiten in diesem Zeitraum liegen.
            Gebuchte Kurse erscheinen so auch im Kalender, ab jetzt bis zum
            Enddatum. Vergangene Stunden kommen nicht dazu.
          </p>
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor="startsAt">Startdatum</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="date"
            defaultValue={values.startsAt}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsAt">Enddatum</Label>
          <Input
            id="endsAt"
            name="endsAt"
            type="date"
            defaultValue={values.endsAt}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="registrationDeadline">Anmeldeschluss</Label>
          <Input
            id="registrationDeadline"
            name="registrationDeadline"
            type="date"
            defaultValue={values.registrationDeadline}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxParticipants">Max. Teilnehmer</Label>
          <Input
            id="maxParticipants"
            name="maxParticipants"
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={values.maxParticipants}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="cancelDeadlineDaysBeforeStart">
            Storno-Frist (Tage vor Kursbeginn)
          </Label>
          <Input
            id="cancelDeadlineDaysBeforeStart"
            name="cancelDeadlineDaysBeforeStart"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={values.cancelDeadlineDaysBeforeStart}
          />
          <p className="text-xs text-muted-foreground">
            Wie viele Tage vor Kursbeginn Teilnehmer noch stornieren können.
            Leer lassen = keine Stornierung möglich.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <p className="text-xs text-muted-foreground">
        Zielgruppe: Leer lassen = alle Altersgruppen. Beispiele: Kinder bis 18
        Jahre (Höchstalter 18), Erwachsene ab 18 (Mindestalter 18).
      </p>
      {isSuperAdmin ? (
        <div className="grid gap-2">
          <Label htmlFor="bundledPlanId">Folgemitgliedschaft (optional)</Label>
          <select
            id="bundledPlanId"
            name="bundledPlanId"
            defaultValue={values.bundledPlanId}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Keine Folgemitgliedschaft</option>
            {subscriptionPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Nur Vereinsmitgliedschaften pro Kalenderjahr. Nach Bezahlung bleibt
            eine laufende Mitgliedschaft bis 31.12. bestehen; das Folgejahr wird
            ohne erneute Zahlung aktiviert. Ohne aktuelle Mitgliedschaft wird
            die Mitgliedschaft für das nächste Kalenderjahr vorgemerkt.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="allowWithoutMembership"
              defaultChecked={values.allowWithoutMembership}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Auch ohne Vereinsmitgliedschaft buchbar. Standard: aus. Nur
              Haupt-Admins können das aktivieren.
            </span>
          </label>
        </div>
      ) : null}
      <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="requiresDocuments"
            checked={requiresDocuments}
            onChange={(event) => setRequiresDocuments(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">Dokumente erforderlich</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Passfoto, Ausweis und Sanitätskarte sind Pflicht vor der Zahlung.
              Das ärztliche Attest kann auch später unter „Mein Konto“
              nachgereicht werden.
            </span>
          </span>
        </label>
        {requiresDocuments ? (
          <div className="ml-6 grid gap-3">
            {(
              [
                {
                  name: "requiresPassportPhoto",
                  label: "Passfoto",
                  hint: "Pflichtfeld – Upload vor der Zahlung.",
                  checked: values.requiresPassportPhoto,
                },
                {
                  name: "requiresIdFront",
                  label: "Ausweis vorne",
                  hint: "Pflichtfeld – Upload vor der Zahlung.",
                  checked: values.requiresIdFront,
                },
                {
                  name: "requiresIdBack",
                  label: "Ausweis hinten",
                  hint: "Pflichtfeld – Upload vor der Zahlung.",
                  checked: values.requiresIdBack,
                },
                {
                  name: "requiresHealthCard",
                  label: "Sanitätskarte",
                  hint: "Pflichtfeld – Upload vor der Zahlung.",
                  checked: values.requiresHealthCard,
                },
                {
                  name: "requiresMedicalCertificate",
                  label: "Ärztliches Attest",
                  hint: "Optional – kann nach der Anmeldung nachgereicht werden.",
                  checked: values.requiresMedicalCertificate,
                },
              ] as const
            ).map((item) => (
              <label key={item.name} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={item.name}
                  defaultChecked={item.checked}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
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
          aus.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={values.published}
          className="size-4 accent-primary"
        />
        Kurs veröffentlichen
      </label>
      {state?.error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending
          ? "Speichern…"
          : courseId
            ? "Änderungen speichern"
            : "Kurs anlegen"}
      </Button>
    </form>
  );
}

export function TogglePublishedButton({
  courseId,
  published,
}: {
  courseId: string;
  published: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await toggleCoursePublishedAction(courseId);
        });
      }}
    >
      {published ? "Zurückziehen" : "Veröffentlichen"}
    </Button>
  );
}
