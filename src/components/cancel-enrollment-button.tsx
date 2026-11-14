"use client";

import { useState, useTransition } from "react";
import { cancelEnrollmentAction } from "@/app/actions/enrollment-cancel";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

export function CancelEnrollmentButton({
  enrollmentId,
  courseTitle,
  refundCents = 0,
  paymentMethod = null,
  paidByCard = false,
  waitlisted = false,
  canCancel = true,
  cancelBlockedMessage,
}: {
  enrollmentId: string;
  courseTitle: string;
  refundCents?: number;
  paymentMethod?: "STRIPE" | "BANK_TRANSFER" | null;
  paidByCard?: boolean;
  waitlisted?: boolean;
  canCancel?: boolean;
  cancelBlockedMessage?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  if (!canCancel && !waitlisted) {
    return (
      <p className="text-xs text-muted-foreground">
        {cancelBlockedMessage ?? "Stornierung nicht mehr möglich."}
      </p>
    );
  }

  const cardRefund = paidByCard || paymentMethod === "STRIPE";
  const refundHint =
    refundCents > 0 && paymentMethod === "BANK_TRANSFER"
      ? ` ${formatEuro(refundCents)} bleiben als Guthaben, bis die Rücküberweisung in der Buchhaltung bestätigt ist.`
      : refundCents > 0 && cardRefund
        ? " Rückerstattung abzüglich Transaktionskosten."
        : refundCents > 0
          ? ` ${formatEuro(refundCents)} werden Ihrem Guthaben gutgeschrieben.`
          : waitlisted
            ? " Sie verlieren Ihren Platz auf der Warteliste."
            : "";

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const ok = window.confirm(
            `Anmeldung für „${courseTitle}“ zurücknehmen?${refundHint}`,
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
                `Die Rückerstattung auf die Karte ist fehlgeschlagen. ${formatEuro(result.cardRefundCreditedCents)} wurden dem Guthaben dieser Sektion gutgeschrieben.`,
              );
            } else if (result.pendingRefundCents > 0) {
              window.alert(
                `Die Rückerstattung auf die Karte ist fehlgeschlagen. ${formatEuro(result.pendingRefundCents)} stehen unter „Zurückzuweisende Überweisungen“.`,
              );
            }
            setDone(true);
            window.location.reload();
          });
        }}
      >
        {pending ? "Wird zurückgenommen…" : waitlisted ? "Von Warteliste abmelden" : "Anmeldung zurücknehmen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
