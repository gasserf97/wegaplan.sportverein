export type CardRail = "connect" | "pending" | "legacy" | "none";

/**
 * Sobald ein Connect-Konto existiert, gehen neue Kartenzahlungen dorthin.
 * Bis Stripe die Zahlungen freischaltet, greifen die alten Sektions-Schlüssel nicht.
 */
export function cardRail(input: {
  accountId: string;
  chargesEnabled: boolean;
  legacyReady: boolean;
}): CardRail {
  if (input.accountId.trim()) {
    return input.chargesEnabled ? "connect" : "pending";
  }
  return input.legacyReady ? "legacy" : "none";
}
