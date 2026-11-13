"use client";

import { useState, useTransition } from "react";
import { startSubscriptionCheckoutAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";

export function SubscriptionCheckout({
  planId,
  label,
  intervalLabel,
  autoRenewOffered,
}: {
  planId: string;
  label: string;
  intervalLabel: string;
  autoRenewOffered: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);

  return (
    <div className="grid gap-4">
      {autoRenewOffered ? (
        <label className="flex items-start gap-2 text-sm leading-6">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(event) => setAutoRenew(event.target.checked)}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            Automatisch {intervalLabel} verlängern. Ich stimme der Verlängerung bei
            dieser ersten Anmeldung zu und kann sie später im Konto abschalten.
          </span>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          Diese Mitgliedschaft gilt für eine Periode ({intervalLabel}) ohne automatische
          Verlängerung.
        </p>
      )}
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await startSubscriptionCheckoutAction(planId, autoRenew);
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            if (result && "url" in result) {
              window.location.assign(result.url);
            }
          });
        }}
      >
        {pending ? "Weiterleitung…" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
