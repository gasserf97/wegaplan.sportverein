"use client";

import { useActionState, useEffect, useState } from "react";
import {
  addFamilyMemberAction,
  updateFamilyMemberAction,
  type FamilyFormState,
} from "@/app/actions/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaxIdField } from "@/components/tax-id-field";
import { splitPersonName } from "@/lib/profile";

export type AccountAddress = {
  street: string;
  postalCode: string;
  city: string;
};

export function AddFamilyMemberForm({
  accountAddress,
}: {
  accountAddress: AccountAddress | null;
}) {
  const [state, formAction, pending] = useActionState<FamilyFormState, FormData>(
    addFamilyMemberAction,
    null,
  );

  const draft = state && "error" in state ? state.fields : undefined;
  const hasAccountAddress = Boolean(
    accountAddress?.street?.trim() &&
      accountAddress?.postalCode?.trim() &&
      accountAddress?.city?.trim(),
  );
  const [useAccountAddress, setUseAccountAddress] = useState(
    () => draft?.useAccountAddress ?? hasAccountAddress,
  );
  const [noPlatformAccess, setNoPlatformAccess] = useState(
    () => draft?.noPlatformAccess ?? false,
  );

  const formKey =
    state && "ok" in state
      ? "add-family-ok"
      : draft
        ? `add-family-${draft.email}-${draft.useAccountAddress}-${draft.noPlatformAccess}`
        : "add-family";

  const addressLabel = hasAccountAddress
    ? `${accountAddress!.street}, ${accountAddress!.postalCode} ${accountAddress!.city}`
    : null;

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid w-full gap-4 rounded-xl border border-border bg-card p-5"
    >
      <h3 className="font-heading text-lg">Familienmitglied anlegen</h3>
      <p className="text-sm text-muted-foreground">
        Mit Plattformzugang erhält die Person eine E-Mail und legt selbst ein
        Passwort fest. Ohne Zugang (z. B. Kinder) buchen Sie über das
        Familienkonto.
      </p>
      <label className="flex w-full items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="noPlatformAccess"
          checked={noPlatformAccess}
          onChange={(event) => setNoPlatformAccess(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">
          Für Kinder: Dieser Benutzer benötigt keinen Zugang zur Plattform
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Dann entfällt die Einladungs-E-Mail. Buchungen laufen über Ihr
            Familienkonto.
          </span>
        </span>
      </label>
      <div className="grid w-full gap-4 sm:grid-cols-2 sm:items-start">
        <div className="grid gap-2">
          <Label htmlFor="firstName" required>
            Vorname
          </Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            defaultValue={draft?.firstName}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName" required>
            Nachname
          </Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            defaultValue={draft?.lastName}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="birthDate" required>
            Geburtsdatum
          </Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={draft?.birthDate}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone" required={!noPlatformAccess}>
            Mobiltelefon
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={draft?.phone}
            required={!noPlatformAccess}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email" required={!noPlatformAccess}>
            E-Mail
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={draft?.email}
            required={!noPlatformAccess}
          />
          <p className="text-xs text-muted-foreground">
            {noPlatformAccess
              ? "Optional – ohne E-Mail gehen Bestätigungen an Ihr Familienkonto."
              : "Pflicht für den Zugang. Die Person erhält eine Einladungs-E-Mail."}
          </p>
        </div>
        <div className="sm:col-span-2">
          <TaxIdField
            id="taxId"
            label="Steuernummer / Codice fiscale"
            defaultValue={draft?.taxId}
          />
        </div>

        <div className="grid gap-3 sm:col-span-2">
          {hasAccountAddress ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="useAccountAddress"
                checked={useAccountAddress}
                onChange={(event) => setUseAccountAddress(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                Diese Adresse übernehmen
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {addressLabel}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              In Ihrem Konto ist noch keine Adresse hinterlegt – bitte unten
              eintragen.
            </p>
          )}
          {!useAccountAddress || !hasAccountAddress ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="street" required>
                  Straße und Hausnummer
                </Label>
                <Input
                  id="street"
                  name="street"
                  autoComplete="street-address"
                  defaultValue={draft?.street}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="postalCode" required>
                  Postleitzahl
                </Label>
                <Input
                  id="postalCode"
                  name="postalCode"
                  inputMode="numeric"
                  defaultValue={draft?.postalCode}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city" required>
                  Wohnort
                </Label>
                <Input
                  id="city"
                  name="city"
                  defaultValue={draft?.city}
                  required
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {state && "error" in state ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state && "ok" in state ? (
        <p className="text-sm text-muted-foreground">
          {state.inviteSent
            ? "Familienmitglied gespeichert. Einladungs-E-Mail wurde gesendet."
            : "Familienmitglied gespeichert."}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Speichern…" : "Mitglied hinzufügen"}
      </Button>
    </form>
  );
}

export function EditFamilyMemberForm({
  memberId,
  name,
  email,
  phone,
  taxId,
  street,
  postalCode,
  city,
  birthDate,
  isSelf = false,
  canLogin = true,
  onSaved,
}: {
  memberId: string;
  name: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  birthDate: string;
  isSelf?: boolean;
  canLogin?: boolean;
  onSaved?: (result?: { inviteSent?: boolean }) => void;
}) {
  const bound = updateFamilyMemberAction.bind(null, memberId);
  const [state, formAction, pending] = useActionState<FamilyFormState, FormData>(
    bound,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) onSaved?.({ inviteSent: state.inviteSent });
  }, [state, onSaved]);

  const draft = state && "error" in state ? state.fields : undefined;
  const [noPlatformAccess, setNoPlatformAccess] = useState(
    () => draft?.noPlatformAccess ?? !canLogin,
  );
  const nameParts = splitPersonName(name);
  const values = {
    firstName: draft?.firstName ?? nameParts.firstName,
    lastName: draft?.lastName ?? nameParts.lastName,
    email: draft?.email ?? email,
    phone: draft?.phone ?? phone,
    taxId: draft?.taxId ?? taxId,
    street: draft?.street ?? street,
    postalCode: draft?.postalCode ?? postalCode,
    city: draft?.city ?? city,
    birthDate: draft?.birthDate ?? birthDate,
  };
  const formKey = draft
    ? `edit-family-${memberId}-${draft.email}-${draft.noPlatformAccess}`
    : `edit-family-${memberId}`;

  return (
    <form key={formKey} action={formAction} className="grid gap-3 sm:grid-cols-2">
      {isSelf ? (
        <p className="sm:col-span-2 text-sm font-medium">Meine Daten bearbeiten</p>
      ) : (
        <label className="flex w-full items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="noPlatformAccess"
            checked={noPlatformAccess}
            onChange={(event) => setNoPlatformAccess(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="min-w-0 flex-1">
            Für Kinder: Dieser Benutzer benötigt keinen Zugang zur Plattform
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {noPlatformAccess
                ? "Häkchen entfernen und eine E-Mail eintragen. Dann startet die Einladung und die Person legt selbst ein Passwort fest."
                : canLogin
                  ? "E-Mail ist Pflicht für den Zugang."
                  : "E-Mail ist Pflicht. Beim Speichern geht die Einladung raus."}
            </span>
          </span>
        </label>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`firstName-${memberId}`} required>
          Vorname
        </Label>
        <Input
          id={`firstName-${memberId}`}
          name="firstName"
          autoComplete="given-name"
          defaultValue={values.firstName}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`lastName-${memberId}`} required>
          Nachname
        </Label>
        <Input
          id={`lastName-${memberId}`}
          name="lastName"
          autoComplete="family-name"
          defaultValue={values.lastName}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`birth-${memberId}`} required>
          Geburtsdatum
        </Label>
        <Input
          id={`birth-${memberId}`}
          name="birthDate"
          type="date"
          defaultValue={values.birthDate}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`phone-${memberId}`} required={isSelf || !noPlatformAccess}>
          Mobiltelefon
        </Label>
        <Input
          id={`phone-${memberId}`}
          name="phone"
          type="tel"
          defaultValue={values.phone}
          required={isSelf || !noPlatformAccess}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`email-${memberId}`} required={isSelf || !noPlatformAccess}>
          E-Mail
        </Label>
        <Input
          id={`email-${memberId}`}
          name="email"
          type="email"
          defaultValue={values.email}
          required={isSelf || !noPlatformAccess}
        />
        {!isSelf ? (
          <p className="text-xs text-muted-foreground">
            {noPlatformAccess
              ? "Optional. Ohne eigene E-Mail gehen Bestätigungen und Mitgliedskarte an das Familienkonto."
              : "Pflicht für den Zugang. Die Person erhält eine Einladungs-E-Mail."}
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <TaxIdField
          id={`tax-${memberId}`}
          label="Steuernummer / Codice fiscale"
          defaultValue={values.taxId}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`street-${memberId}`} required>
          Straße und Hausnummer
        </Label>
        <Input
          id={`street-${memberId}`}
          name="street"
          defaultValue={values.street}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`postal-${memberId}`} required>
          Postleitzahl
        </Label>
        <Input
          id={`postal-${memberId}`}
          name="postalCode"
          defaultValue={values.postalCode}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`city-${memberId}`} required>
          Wohnort
        </Label>
        <Input
          id={`city-${memberId}`}
          name="city"
          defaultValue={values.city}
          required
        />
      </div>
      {isSelf && canLogin ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`password-${memberId}`}>Neues Passwort</Label>
            <Input
              id={`password-${memberId}`}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`passwordConfirm-${memberId}`}>
              Neues Passwort wiederholen
            </Label>
            <Input
              id={`passwordConfirm-${memberId}`}
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Leer lassen, um das Passwort unverändert zu lassen.
          </p>
        </>
      ) : null}
      <div className="grid gap-2 sm:col-span-2">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </Button>
        {state && "error" in state ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state && "ok" in state ? (
          <p className="text-sm text-muted-foreground">Gespeichert.</p>
        ) : null}
      </div>
    </form>
  );
}
