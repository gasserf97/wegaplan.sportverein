/** Ab dieser Anzahl: 4 kompakte Karten pro Zeile statt 3 große. */
export const CATALOG_COMPACT_FROM = 7;

export function catalogUsesCompactCards(count: number) {
  return count >= CATALOG_COMPACT_FROM;
}

export function catalogCardGridClass(count: number) {
  return catalogUsesCompactCards(count)
    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";
}
