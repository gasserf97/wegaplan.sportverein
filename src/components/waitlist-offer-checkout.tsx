"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { startWaitlistOfferCheckoutAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import type { CheckoutPaymentChoice } from "@/lib/bank-transfer";
import { formatDateTime, formatEuro } from "@/lib/format";

export function WaitlistOfferCheckout({
  courseId,
  enrollmentId,
  token,
  courseTitle,
  memberName,
  priceCents,
  expiresAt,
  stripeAvailable,
  bankTransferAvailable,
  creditBalanceCents,
}: {
  courseId: string;
  enrollmentId: string;
  token: string;
  courseTitle: string;
  memberName: string;
  priceCents: number;
  expiresAt: string;
  stripeAvailable: boolean;
  bankTransferAvailable: boolean;
  creditBalanceCents: number;
}) {
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentChoice>(
    stripeAvailable ? "stripe" : "bank_transfer",
  );
  const [useCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const creditApplied = 0;
  const cardCents = Math.max(0, priceCents - creditApplied);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Platz für <strong>{memberName}</strong> im Kurs „{courseTitle}“. Bitte bis{" "}
        <strong>{formatDateTime(new Date(expiresAt))}</strong> bezahlen.
      </p>
      <p className="font-heading text-3xl">
        {priceCents === 0 ? "Kostenlos" : formatEuro(priceCents)}
      </p>
      {cardCents > 0 ? (
        <div className="grid gap-2">
          {stripeAvailable ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payment"
                checked={paymentMethod === "stripe"}
                onChange={() => setPaymentMethod("stripe")}
              />
              Karte (Stripe)
            </label>
          ) : null}
          {bankTransferAvailable ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payment"
                checked={paymentMethod === "bank_transfer"}
                onChange={() => setPaymentMethod("bank_transfer")}
              />
              Überweisung (48 Stunden Frist beachten)
            </label>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await startWaitlistOfferCheckoutAction(
                courseId,
                enrollmentId,
                token,
                paymentMethod,
                useCredit,
              );
              if (!result || "error" in result) {
                setError(result?.error ?? "Unbekannter Fehler");
                return;
              }
              if ("url" in result && result.url) {
                window.location.href = result.url;
              }
            });
          }}
        >
          {pending
            ? "Weiter…"
            : priceCents === 0 || cardCents === 0
              ? "Platz sichern"
              : "Jetzt bezahlen"}
        </Button>
        <Link
          href={`/kurse/${courseId}`}
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm"
        >
          Zum Kurs
        </Link>
      </div>
    </div>
  );
}
