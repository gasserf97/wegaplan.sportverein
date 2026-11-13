"use client";

import { useState, useTransition } from "react";
import { cancelEnrollmentAction } from "@/app/actions/enrollment-cancel";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

export function RemoveCourseEnrollmentButton({
  enrollmentId,
  memberName,
  refundCents = 0,
  paymentMethod = null,
  paidByCard = false,
}: {
  enrollmentId: string;
  memberName: string;
  refundCents?: number;
  paymentMethod?: "STRIPE" | "BANK_TRANSFER" | null;
  paidByCard?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  const cardRefund = paidByCard || paymentMethod === "STRIPE";
  const refundHint =
    refundCents > 0 && paymentMethod === "BANK_TRANSFER"
      ? ` ${formatEuro(refundCents)} bleiben als Guthaben, bis die Rücküberweisung in der Buchhaltung bestätigt ist.`
      : refundCents > 0 && cardRefund
        ? " Rückerstattung abzüglich Transaktionskosten."
        : refundCents > 0
          ? ` ${formatEuro(refundCents)} werden dem Guthaben gutgeschrieben.`
          : "";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const ok = window.confirm(
            `„${memberName}“ aus dem Kurs entfernen?${refundHint}`,
          );
          if (!ok) return;
          setError(null);
          start(async () => {
            const result = await cancelEnrollmentAction(enrollmentId);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            if (result.cardRefundCreditedCents > 0) {
              window.alert(
                `Die Rückerstattung auf die Karte ist fehlgeschlagen. ${formatEuro(result.cardRefundCreditedCents)} wurden als Guthaben gutgeschrieben.`,
              );
            }
            setDone(true);
            window.location.reload();
          });
        }}
      >
        {pending ? "Entfernen…" : "Aus Kurs entfernen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
