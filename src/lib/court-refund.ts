import { addCreditRefundOnce } from "@/lib/credit";
import { cashRefundPayoutCents } from "@/lib/pending-refund";
import { courtReservationIsPaid } from "@/lib/court-booking";
import {
  fetchStripeFeeFromCheckoutSession,
  resolveStripeFeeCents,
} from "@/lib/stripe-fees";
import {
  cardRefundAmountCents,
  refundStripeCheckoutSession,
} from "@/lib/stripe-refund";

type RefundableCourtReservation = {
  id: string;
  userId: string | null;
  priceCents: number;
  creditAppliedCents: number;
  stripeFeeCents: number | null;
  stripeSessionId: string | null;
  paidAt: Date | null;
  court: { name: string; sectionId: string | null };
};

export type CourtCancellationRefund = {
  /** Auf die Karte erstatteter Betrag (Kartenanteil minus Stripe-Gebühr). */
  refundedCents: number;
  /** Zurückgelegter Guthabenanteil der ursprünglichen Buchung. */
  restoredCreditCents: number;
  /** Kartenanteil, der wegen fehlgeschlagener Erstattung als Guthaben gutgeschrieben wurde. */
  cardRefundCreditedCents: number;
  cardRefunded: boolean;
};

/**
 * Tennis-Storno: Kartenanteil abzüglich Stripe-Gebühr zurück auf die Karte.
 * Ein bereits verwendeter Guthabenanteil kommt auf das Guthaben zurück.
 * Schlägt die Kartenerstattung fehl, wird derselbe Betrag als Guthaben gutgeschrieben.
 */
export async function refundPaidCourtReservation(
  reservation: RefundableCourtReservation,
): Promise<CourtCancellationRefund> {
  const empty: CourtCancellationRefund = {
    refundedCents: 0,
    restoredCreditCents: 0,
    cardRefundCreditedCents: 0,
    cardRefunded: false,
  };
  if (!courtReservationIsPaid(reservation)) return empty;

  const externalCents = Math.max(
    0,
    reservation.priceCents - Math.max(0, reservation.creditAppliedCents),
  );

  let refundedCents = 0;
  let cardRefunded = false;
  let cardRefundCreditedCents = 0;
  if (externalCents > 0) {
    const creditCardPortion = (cents: number) => {
      if (!reservation.userId || cents <= 0) return 0;
      return addCreditRefundOnce(reservation.userId, cents, {
        description: `Stornierung Tennisplatz (Kartenerstattung fehlgeschlagen): ${reservation.court.name}`,
        courtReservationId: reservation.id,
      });
    };
    const cardPortionCents = (
      feeCents: number | null | undefined,
    ) => {
      const resolved = resolveStripeFeeCents(externalCents, feeCents);
      const payout = cashRefundPayoutCents({
        paymentMethod: "STRIPE",
        externalCents,
        stripeFeeCents: resolved.feeCents,
        stripeSessionId: reservation.stripeSessionId,
      });
      return cardRefundAmountCents(externalCents, payout.payoutCents);
    };

    if (!reservation.stripeSessionId) {
      if (reservation.userId) {
        cardRefundCreditedCents = await creditCardPortion(
          cardPortionCents(reservation.stripeFeeCents),
        );
      }
    } else {
      let attemptedCents = 0;
      try {
        const storedFee =
          reservation.stripeFeeCents ??
          (await fetchStripeFeeFromCheckoutSession(reservation.stripeSessionId));
        attemptedCents = cardPortionCents(storedFee);
        if (attemptedCents > 0) {
          await refundStripeCheckoutSession({
            sessionId: reservation.stripeSessionId,
            amountCents: attemptedCents,
            sectionId: reservation.court.sectionId,
            idempotencyKey: `court-refund-v2-${reservation.id}-${attemptedCents}`,
          });
          refundedCents = attemptedCents;
          cardRefunded = true;
        }
      } catch (error) {
        console.error("Tennisplatz-Erstattung", reservation.id, error);
        const fallbackCents =
          attemptedCents > 0
            ? attemptedCents
            : cardPortionCents(reservation.stripeFeeCents);
        if (!reservation.userId) {
          if (fallbackCents > 0) throw error;
        } else {
          cardRefundCreditedCents = await creditCardPortion(fallbackCents);
        }
      }
    }
  }

  let restoredCreditCents = 0;
  if (reservation.userId && reservation.creditAppliedCents > 0) {
    restoredCreditCents = await addCreditRefundOnce(
      reservation.userId,
      reservation.creditAppliedCents,
      {
        description: `Stornierung Tennisplatz (Guthabenanteil): ${reservation.court.name}`,
        courtReservationId: reservation.id,
      },
    );
  }

  return {
    refundedCents,
    restoredCreditCents,
    cardRefundCreditedCents,
    cardRefunded,
  };
}
