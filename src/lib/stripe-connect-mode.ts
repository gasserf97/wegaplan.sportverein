export type CardRail = "connect" | "pending" | "legacy" | "none";

/**
 * Ein eigener Secret Key der Sektion ist das normale Stripe-Konto.
 * Ein verbundenes Konto gilt nur, solange kein solcher Schlüssel hinterlegt ist.
 */
export function cardRail(input: {
  accountId: string;
  chargesEnabled: boolean;
  legacyReady: boolean;
}): CardRail {
  if (input.legacyReady) return "legacy";
  if (input.accountId.trim()) {
    return input.chargesEnabled ? "connect" : "pending";
  }
  return "none";
}
