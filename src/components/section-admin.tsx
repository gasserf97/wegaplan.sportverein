"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createSectionAction,
  deleteSectionAction,
  moveSectionAction,
  updateSectionAccentAction,
  updateSectionCreditAllowedAction,
  updateSectionPaymentEnvKeyAction,
  type ActionState,
  type SectionPaymentEnvState,
} from "@/app/actions/sections";
import { COURSE_ACCENTS, resolveAccent } from "@/lib/accents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AccentSelect({
  id,
  name,
  defaultValue,
  value,
  disabled,
  onChange,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={value == null ? (defaultValue ?? "red") : undefined}
      value={value}
      disabled={disabled}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
    >
      {Object.entries(COURSE_ACCENTS).map(([key, item]) => (
        <option key={key} value={key}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function SectionCreateForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSectionAction,
    null,
  );
  const draft = state && "error" in state ? state.fields : undefined;
  const formKey =
    state && "ok" in state
      ? "section-ok"
      : draft
        ? `section-${draft.name}`
        : "section";

  return (
    <form
      key={formKey}
      action={formAction}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="grid flex-1 gap-2">
        <Label htmlFor="name">Neue Sektion</Label>
        <Input
          id="name"
          name="name"
          defaultValue={draft?.name}
          required
          minLength={2}
          maxLength={80}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="accent">Kartenfarbe</Label>
        <AccentSelect id="accent" name="accent" defaultValue={draft?.accent} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Anlegen…" : "Sektion anlegen"}
      </Button>
      {state && "error" in state ? (
        <p className="w-full text-sm text-destructive sm:col-span-2">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <p className="w-full text-sm text-primary sm:col-span-2">Sektion angelegt.</p>
      ) : null}
    </form>
  );
}

export function SectionAccentForm({
  sectionId,
  accent,
}: {
  sectionId: string;
  accent: string;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState<string>(resolveAccent(accent));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <Label htmlFor={`accent-${sectionId}`}>Kartenfarbe</Label>
      <AccentSelect
        id={`accent-${sectionId}`}
        value={value}
        disabled={pending}
        onChange={(next) => {
          setValue(next);
          setError(null);
          start(async () => {
            const result = await updateSectionAccentAction(sectionId, next);
            if (result && "error" in result) setError(result.error);
          });
        }}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function SectionCreditToggle({
  sectionId,
  creditAllowed,
}: {
  sectionId: string;
  creditAllowed: boolean;
}) {
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(creditAllowed);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            setError(null);
            start(async () => {
              const result = await updateSectionCreditAllowedAction(
                sectionId,
                next,
              );
              if (result && "error" in result) {
                setEnabled(!next);
                setError(result.error);
              }
            });
          }}
        />
        <span>
          <span className="font-medium">Guthaben möglich</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Aktiv: eine fehlgeschlagene Kartenerstattung geht auf das
            Guthabenkonto dieser Sektion und gilt nur für Buchungen der
            Sektion. Inaktiv: der Betrag steht unter Zurückzuweisende
            Überweisungen. Standard ist aus.
          </span>
        </span>
      </label>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function SectionDeleteButton({ sectionId }: { sectionId: string }) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Sektion wirklich löschen? Nur möglich, wenn keine Kurse, Mitgliedschaften, Fahrzeuge, Plätze oder offenen Rücküberweisungen mehr zugeordnet sind.",
          )
        ) {
          return;
        }
        start(async () => {
          const result = await deleteSectionAction(sectionId);
          if (result && "error" in result) {
            alert(result.error);
          }
        });
      }}
    >
      Löschen
    </Button>
  );
}

export function SectionMoveButtons({
  sectionId,
  canMoveUp,
  canMoveDown,
}: {
  sectionId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(direction: "up" | "down") {
    setError(null);
    start(async () => {
      const result = await moveSectionAction(sectionId, direction);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !canMoveUp}
          onClick={() => move("up")}
          aria-label="Nach oben"
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !canMoveDown}
          onClick={() => move("down")}
          aria-label="Nach unten"
        >
          ↓
        </Button>
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function SectionStripeSetupGuide({
  webhookUrl,
  connect,
}: {
  webhookUrl: string;
  connect: "active" | "pending" | "off";
}) {
  return (
    <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
      <h2 className="text-lg font-medium">Stripe: ein Konto pro Verein</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Kartenzahlungen aller Sektionen laufen über das Stripe-Konto des Vereins.
        Der Betreiber eröffnet es unter Vereine. Stripe zahlt auf das dort
        hinterlegte Bankkonto aus. Die IBAN einer Sektion gilt für Überweisungen.
      </p>
      {connect === "active" ? (
        <p className="mt-3 text-sm text-emerald-700">
          Das Vereinskonto ist für Kartenzahlungen freigeschaltet.
        </p>
      ) : null}
      {connect === "pending" ? (
        <p className="mt-3 text-sm text-amber-700">
          Das Stripe-Konto ist angelegt. Die Einrichtung bei Stripe ist noch
          nicht abgeschlossen.
        </p>
      ) : null}
      {connect === "off" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Solange kein Connect-Konto hinterlegt ist, gelten die bisherigen
          Schlüssel pro Sektion. Webhook dafür:{" "}
          <code className="break-all text-xs text-foreground">{webhookUrl}</code>
        </p>
      ) : null}
    </div>
  );
}

export function SectionSettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-lg bg-muted/40 p-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SectionPaymentsForm({
  sectionId,
  paymentEnvKey,
  bankConfigured,
  stripeCheckoutReady,
  stripeWebhookConfigured,
}: {
  sectionId: string;
  paymentEnvKey: string;
  bankConfigured: boolean;
  stripeCheckoutReady: boolean;
  stripeWebhookConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SectionPaymentEnvState,
    FormData
  >(updateSectionPaymentEnvKeyAction, null);
  const draft = state && "error" in state ? state.fields : undefined;
  const envKey = draft?.paymentEnvKey ?? paymentEnvKey;
  const normalized = envKey.trim().toUpperCase();
  const prefix = normalized ? `PAYMENT_${normalized}_` : "PAYMENT_<KEY>_";
  const formKey =
    state && "ok" in state
      ? `${sectionId}-ok`
      : draft
        ? `${sectionId}-${draft.paymentEnvKey}`
        : sectionId;

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-3"
    >
      <input type="hidden" name="sectionId" value={sectionId} />
      <p className="text-xs text-muted-foreground">
        IBAN und, falls der Verein noch kein Connect-Konto hat, Stripe-Schlüssel
        pflegt der Betreiber. Hier bleibt nur der optionale Env-Key als Fallback
        für ältere Installationen.
      </p>
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor={`payment-env-key-${sectionId}`}>Env-Key</Label>
        <Input
          id={`payment-env-key-${sectionId}`}
          name="paymentEnvKey"
          defaultValue={envKey}
          autoCapitalize="characters"
          maxLength={40}
        />
        <p className="text-xs text-muted-foreground">
          Erlaubt: A-Z, 0-9 und _. Beispiel <code>TENNIS</code> erzeugt
          Variablen mit Prefix <code>PAYMENT_TENNIS_</code>.
        </p>
      </div>
      <ul className="grid gap-1 text-xs text-muted-foreground">
        <li>
          <code>{prefix}BANK_ACCOUNT_HOLDER</code>{" "}
          {bankConfigured ? "(gesetzt)" : "(fehlt)"}
        </li>
        <li>
          <code>{prefix}BANK_IBAN</code> {bankConfigured ? "(gesetzt)" : "(fehlt)"}
        </li>
        <li>
          <code>{prefix}STRIPE_SECRET_KEY</code>{" "}
          {stripeCheckoutReady ? "(gesetzt)" : "(fehlt)"}
        </li>
        <li>
          <code>{prefix}STRIPE_WEBHOOK_SECRET</code>{" "}
          {stripeWebhookConfigured ? "(gesetzt)" : "(fehlt)"}
        </li>
      </ul>
      <p
        className={
          bankConfigured && stripeCheckoutReady && stripeWebhookConfigured
            ? "text-xs text-emerald-700"
            : "text-xs text-amber-700"
        }
      >
        {bankConfigured && stripeCheckoutReady && stripeWebhookConfigured
          ? "Zahlungsdaten sind hinterlegt."
          : "Zahlungsdaten fehlen noch in den Vereinseinstellungen des Betreibers."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Env-Key speichern"}
        </Button>
        {state && "error" in state ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state && "ok" in state ? (
          <p className="text-sm text-primary">Gespeichert.</p>
        ) : null}
      </div>
    </form>
  );
}
