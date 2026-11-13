/**
 * Betrag für Buchhaltung / abgeschlossene Zahlungen.
 * Gespeicherter Kaufpreis hat Vorrang; der aktuelle Katalogpreis gilt nur für offene Buchungen.
 */
export function accountingAmountCents(
  paidCents: number | null | undefined,
  catalogPriceCents: number,
  pending: boolean,
): number {
  if (paidCents != null) return paidCents;
  if (pending) return catalogPriceCents;
  return 0;
}

/** Anteil, der per Karte oder Überweisung fällig ist (ohne Guthaben). */
export function externalPaymentDueCents(
  paidCents: number | null | undefined,
  catalogPriceCents: number,
  creditAppliedCents: number,
  pending: boolean,
): number {
  const total = accountingAmountCents(paidCents, catalogPriceCents, pending);
  return Math.max(0, total - Math.max(0, creditAppliedCents));
}

/** Guthaben-Gutschrift bei Stornierung einer bezahlten Kursbuchung. */
export function enrollmentCreditRefundCents(enrollment: {
  paidCents: number | null;
  creditAppliedCents: number;
  course: { priceCents: number };
}) {
  return accountingAmountCents(
    enrollment.paidCents,
    enrollment.course.priceCents,
    false,
  );
}

/** Guthaben-Gutschrift bei Stornierung einer bezahlten Reservierung (Tennis/Auto). */
export function reservationCreditRefundCents(reservation: {
  priceCents: number;
  paidAt: Date | null;
}) {
  return reservation.priceCents > 0 && reservation.paidAt != null
    ? reservation.priceCents
    : 0;
}
