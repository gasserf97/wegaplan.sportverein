/** Kurz reserviert während Checkout – danach wieder frei, wenn nicht bezahlt. */
export const CHECKOUT_HOLD_MINUTES = 15;

export function checkoutHoldSince(now = new Date()) {
  return new Date(now.getTime() - CHECKOUT_HOLD_MINUTES * 60_000);
}
