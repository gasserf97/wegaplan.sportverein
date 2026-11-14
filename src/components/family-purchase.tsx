"use client";

import { useMemo, useState, useTransition } from "react";
import {
  startCheckoutAction,
  startSubscriptionCheckoutAction,
} from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import type { CheckoutPaymentChoice } from "@/lib/bank-transfer";
import { rememberCoursePendingCheckout, rememberSubscriptionPendingCheckout } from "@/components/court-checkout-cleanup";
import { formatEuro } from "@/lib/format";
import {
  familyBundleRoleLabel,
  quoteFamilySelection,
  type PlanPriceInput,
} from "@/lib/pricing";

export type FamilyBuyer = {
  id: string;
  name: string;
  isSelf: boolean;
  age: number;
  priceCents: number;
  bandLabel: string;
  hasMembership: boolean;
  alreadyHas: boolean;
  ineligibleReason?: string;
};

export type FamilyBundleConfig = {
  plan: PlanPriceInput;
  compositionLabel: string;
  childMaxAge: number;
};

export function FamilyPurchase({
  kind,
  itemId,
  people,
  requireMembership,
  autoRenewOffered,
  intervalLabel,
  submitLabel,
  familyBundle,
  stripeAvailable,
  bankTransferAvailable,
  creditBalanceCents = 0,
}: {
  kind: "plan" | "course";
  itemId: string;
  people: FamilyBuyer[];
  requireMembership: boolean;
  autoRenewOffered?: boolean;
  intervalLabel?: string;
  submitLabel: string;
  familyBundle?: FamilyBundleConfig;
  stripeAvailable: boolean;
  bankTransferAvailable: boolean;
  creditBalanceCents?: number;
}) {
  const selectable = people.filter((person) => {
    if (person.alreadyHas) return false;
    if (person.ineligibleReason) return false;
    if (requireMembership && !person.hasMembership) return false;
    return true;
  });
  const defaultIds = selectable.map((person) => person.id);
  const [selected, setSelected] = useState<string[]>(defaultIds);
  const [autoRenew, setAutoRenew] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentChoice>(
    stripeAvailable ? "stripe" : "bank_transfer",
  );
  const creditAllowed = creditBalanceCents > 0;
  const [useCredit, setUseCredit] = useState(creditBalanceCents > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const familyQuote = useMemo(() => {
    if (!familyBundle || selected.length === 0) return null;
    const members = people
      .filter((person) => selected.includes(person.id))
      .map((person) => ({ id: person.id, age: person.age }));
    return quoteFamilySelection(members, familyBundle.plan);
  }, [familyBundle, people, selected]);

  const total = useMemo(() => {
    if (familyBundle) {
      return familyQuote?.totalCents ?? null;
    }
    return people
      .filter((person) => selected.includes(person.id))
      .reduce((sum, person) => sum + person.priceCents, 0);
  }, [people, selected, familyBundle, familyQuote]);

  const creditApplied =
    creditAllowed && useCredit && total != null
      ? Math.min(creditBalanceCents, total)
      : 0;
  const amountDue = total == null ? null : Math.max(0, total - creditApplied);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-medium">Für wen kaufen?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {kind === "plan"
            ? "Wählen Sie einzelne Familienmitglieder oder alle."
            : familyBundle
              ? `Wählen Sie beliebige Personen. Passen ${familyBundle.compositionLabel}, wird automatisch die Familienkarte verrechnet – Rest zum Einzelpreis.`
              : "Wählen Sie einzelne Familienmitglieder oder alle. Der Preis folgt dem Geburtsdatum jeder Person."}
        </p>
      </div>
      <ul className="grid gap-2">
        {people.map((person) => {
          const blocked =
            person.alreadyHas ||
            Boolean(person.ineligibleReason) ||
            (requireMembership && !person.hasMembership);
          return (
            <li key={person.id}>
              <label
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  blocked ? "border-border bg-muted/40 text-muted-foreground" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={selected.includes(person.id)}
                  disabled={blocked}
                  onChange={() => toggle(person.id)}
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">
                    {person.name}
                    {person.isSelf ? " (Sie)" : ""}
                    {", "}
                    {person.age} Jahre
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {person.alreadyHas
                      ? "Bereits vorhanden"
                      : person.ineligibleReason
                        ? person.ineligibleReason
                          : requireMembership && !person.hasMembership
                          ? "Zuerst Vereinsmitgliedschaft nötig"
                          : kind === "plan"
                            ? person.priceCents === 0
                              ? "kostenlos"
                              : formatEuro(person.priceCents)
                            : familyBundle
                            ? `${familyBundleRoleLabel(person.age, familyBundle.childMaxAge)} · ${
                                person.priceCents === 0
                                  ? "kostenlos"
                                  : formatEuro(person.priceCents)
                              }`
                            : `${person.bandLabel} · ${
                                person.priceCents === 0
                                  ? "kostenlos"
                                  : formatEuro(person.priceCents)
                              }`}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {selectable.length > 1 ? (
        <button
          type="button"
          className="justify-self-start text-xs underline"
          onClick={() => setSelected(defaultIds)}
        >
          Alle auswählen, die kaufen können
        </button>
      ) : null}
      {familyQuote && familyQuote.summary !== "Keine Auswahl" && kind !== "plan" ? (
        <p className="text-xs text-muted-foreground">{familyQuote.summary}</p>
      ) : null}
      {amountDue != null && amountDue > 0 && (stripeAvailable || bankTransferAvailable) ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Zahlungsart</legend>
          {stripeAvailable ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === "stripe"}
                onChange={() => setPaymentMethod("stripe")}
                className="mt-1 size-4 accent-primary"
              />
              <span>Kreditkarte / Online-Zahlung (Stripe)</span>
            </label>
          ) : null}
          {bankTransferAvailable ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === "bank_transfer"}
                onChange={() => setPaymentMethod("bank_transfer")}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                Überweisung – Sie erhalten IBAN und Verwendungszweck. Freischaltung
                nach Bestätigung durch den Verein.
              </span>
            </label>
          ) : null}
        </fieldset>
      ) : null}
      {kind === "plan" && autoRenewOffered && paymentMethod === "bank_transfer" ? (
        <p className="text-xs text-muted-foreground">
          Automatische Verlängerung ist bei Überweisung nicht verfügbar.
        </p>
      ) : null}
      {kind === "plan" && autoRenewOffered && paymentMethod !== "bank_transfer" ? (
        <label className="flex items-start gap-2 text-sm leading-6">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(event) => setAutoRenew(event.target.checked)}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            Automatisch {intervalLabel} verlängern. Ich stimme der Verlängerung bei
            dieser ersten Anmeldung zu.
          </span>
        </label>
      ) : kind === "plan" ? (
        <p className="text-sm text-muted-foreground">
          Diese Mitgliedschaft gilt für eine Periode ({intervalLabel}) ohne automatische
          Verlängerung.
        </p>
      ) : null}
      {creditAllowed ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={useCredit}
            onChange={(event) => setUseCredit(event.target.checked)}
          />
          <span>
            Guthaben dieser Sektion verwenden ({formatEuro(creditBalanceCents)}{" "}
            verfügbar)
            {creditApplied > 0 ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatEuro(creditApplied)} werden vom Sektionsguthaben abgezogen.
              </span>
            ) : null}
          </span>
        </label>
      ) : null}
      <p className="text-sm">
        {creditApplied > 0 ? (
          <>
            Summe {formatEuro(total ?? 0)} · Guthaben −{formatEuro(creditApplied)} ·{" "}
            <span className="font-heading text-xl">
              zu zahlen {formatEuro(amountDue ?? 0)}
            </span>
          </>
        ) : (
          <>
            Summe:{" "}
            <span className="font-heading text-xl">
              {total == null
                ? "—"
                : total === 0
                  ? "Kostenlos"
                  : formatEuro(total)}
            </span>
          </>
        )}
      </p>
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending || selected.length === 0}
        onClick={() => {
          setError(null);
          start(async () => {
            const renew =
              kind === "plan" && paymentMethod !== "bank_transfer" && autoRenew;
            const result =
              kind === "plan"
                ? await startSubscriptionCheckoutAction(
                    itemId,
                    renew,
                    selected,
                    paymentMethod,
                    useCredit && creditAllowed,
                  )
                : await startCheckoutAction(
                    itemId,
                    selected,
                    paymentMethod,
                    useCredit,
                  );
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            if (result && "url" in result) {
              if (paymentMethod !== "bank_transfer") {
                if (kind === "course") {
                  rememberCoursePendingCheckout(itemId);
                } else {
                  rememberSubscriptionPendingCheckout(itemId);
                }
              }
              window.location.assign(result.url);
            }
          });
        }}
      >
        {pending ? "Weiterleitung…" : submitLabel}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
