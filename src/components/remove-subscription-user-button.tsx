"use client";

import { useState, useTransition } from "react";
import { removeSubscriptionUserAction } from "@/app/actions/subscription-remove";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

export function RemoveSubscriptionUserButton({
  subscriptionId,
  memberName,
  pendingRefundCents = 0,
}: {
  subscriptionId: string;
  memberName: string;
  pendingRefundCents?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refundHint =
    pendingRefundCents > 0
      ? ` Der bezahlte Betrag von ${formatEuro(pendingRefundCents)} wird als Guthaben vorgemerkt und erscheint in der Buchhaltung unter „Zurückzuweisende Überweisungen“. Bei Kartenzahlung wird die Stripe-Gebühr abgezogen.`
      : "";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={() => {
          const confirmed = window.confirm(
            `„${memberName}“ aus dieser Mitgliedschaft entfernen?${refundHint}`,
          );
          if (!confirmed) return;

          setError(null);
          startTransition(async () => {
            const result =
              await removeSubscriptionUserAction(subscriptionId);
            if ("error" in result) {
              setError(result.error);
            }
          });
        }}
      >
        {pending ? "Entfernen…" : "Aus Mitgliedschaft entfernen"}
      </Button>
      {error ? (
        <p className="max-w-56 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
