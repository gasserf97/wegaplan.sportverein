"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateMemberAction,
  type MemberFormState,
} from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaxIdField } from "@/components/tax-id-field";
import { splitPersonName } from "@/lib/profile";

export function EditMemberForm({
  userId,
  name,
  email,
  phone,
  taxId,
  street,
  postalCode,
  city,
  birthDate,
  canLogin,
  allowNoPlatformAccess,
  accountAddress,
  onSaved,
}: {
  userId: string;
  name: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  birthDate: string;
  canLogin: boolean;
  allowNoPlatformAccess: boolean;
  accountAddress: {
    street: string;
    postalCode: string;
    city: string;
  } | null;
  onSaved?: () => void;
}) {
  const bound = updateMemberAction.bind(null, userId);
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(
    bound,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) {
      onSaved?.();
    }
  }, [state, onSaved]);

  const draft = state && "error" in state ? state.fields : undefined;
  const nameParts = splitPersonName(name);
  const [noPlatformAccess, setNoPlatformAccess] = useState(
    () => draft?.noPlatformAccess ?? !canLogin,
  );
  const [useAccountAddress, setUseAccountAddress] = useState(
    () =>
      draft?.useAccountAddress ??
      Boolean(
        accountAddress &&
          street === accountAddress.street &&
          postalCode === accountAddress.postalCode &&
          city === accountAddress.city,
      ),
  );
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
  const hasAccountAddress = Boolean(
    accountAddress?.street.trim() &&
      accountAddress.postalCode.trim() &&
      accountAddress.city.trim(),
  );
  const addressLabel = hasAccountAddress
    ? `${accountAddress!.street}, ${accountAddress!.postalCode} ${accountAddress!.city}`
    : null;
  const formKey = draft
    ? `member-${userId}-${draft.email}-${draft.noPlatformAccess}-${draft.useAccountAddress}`
    : `member-${userId}`;

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid items-start gap-3 sm:grid-cols-2"
    >
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="noPlatformAccess"
          checked={noPlatformAccess}
          disabled={!allowNoPlatformAccess}
          onChange={(event) => setNoPlatformAccess(event.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Für Kinder: Dieser Benutzer benötigt keinen Zugang zur Plattform
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {noPlatformAccess
              ? "Häkchen entfernen und eine E-Mail eintragen. Dann startet die Einladung und die Person legt selbst ein Passwort fest."
              : canLogin
                ? "E-Mail ist Pflicht für den Zugang."
                : "E-Mail ist Pflicht. Beim Speichern geht die Einladung raus."}
            {!allowNoPlatformAccess
              ? " Haupt-Administratoren müssen einen Zugang behalten."
              : ""}
          </span>
        </span>
      </label>
      <div className="grid gap-2">
        <Label htmlFor={`member-firstName-${userId}`} required>
          Vorname
        </Label>
        <Input
          id={`member-firstName-${userId}`}
          name="firstName"
          autoComplete="given-name"
          defaultValue={values.firstName}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`member-lastName-${userId}`} required>
          Nachname
        </Label>
        <Input
          id={`member-lastName-${userId}`}
          name="lastName"
          autoComplete="family-name"
          defaultValue={values.lastName}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`member-birth-${userId}`}>Geburtsdatum</Label>
        <Input
          id={`member-birth-${userId}`}
          name="birthDate"
          type="date"
          defaultValue={values.birthDate}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label
          htmlFor={`member-email-${userId}`}
          required={!noPlatformAccess}
        >
          E-Mail
        </Label>
        <Input
          id={`member-email-${userId}`}
          name="email"
          type="email"
          defaultValue={values.email}
          required={!noPlatformAccess}
        />
      </div>
      <div className="grid gap-2">
        <Label
          htmlFor={`member-phone-${userId}`}
          required={!noPlatformAccess}
        >
          Mobiltelefon
        </Label>
        <Input
          id={`member-phone-${userId}`}
          name="phone"
          type="tel"
          defaultValue={values.phone}
          required={!noPlatformAccess}
        />
      </div>
      <div className="sm:col-span-2">
        <TaxIdField
          id={`member-tax-${userId}`}
          label="Steuernummer / Codice fiscale"
          defaultValue={values.taxId}
        />
      </div>
      <div className="grid gap-3 sm:col-span-2">
        {hasAccountAddress ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="useAccountAddress"
              checked={useAccountAddress}
              onChange={(event) =>
                setUseAccountAddress(event.target.checked)
              }
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Adresse des aktuell angemeldeten Haupt-Admins übernehmen
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {addressLabel}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Im aktuell angemeldeten Admin-Konto ist keine vollständige Adresse
            hinterlegt.
          </p>
        )}
        {!useAccountAddress || !hasAccountAddress ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor={`member-street-${userId}`}>
                Straße und Hausnummer
              </Label>
              <Input
                id={`member-street-${userId}`}
                name="street"
                defaultValue={values.street}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`member-postal-${userId}`}>Postleitzahl</Label>
              <Input
                id={`member-postal-${userId}`}
                name="postalCode"
                defaultValue={values.postalCode}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`member-city-${userId}`}>Wohnort</Label>
              <Input
                id={`member-city-${userId}`}
                name="city"
                defaultValue={values.city}
                required
              />
            </div>
          </div>
        ) : null}
      </div>
      {!noPlatformAccess && canLogin ? (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`member-password-${userId}`}>
            Neues Passwort
          </Label>
          <Input
            id={`member-password-${userId}`}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">
            Leer lassen, um das Passwort unverändert zu lassen.
          </p>
        </div>
      ) : null}
      {!noPlatformAccess && !canLogin ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Beim Speichern geht eine Einladungs-E-Mail raus. Die Person legt
          das Passwort selbst fest.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
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
