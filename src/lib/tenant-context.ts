import { AsyncLocalStorage } from "node:async_hooks";

type ClubStore = { clubId: string | null };

const als = new AsyncLocalStorage<ClubStore>();

let resolveFromRequest: (() => Promise<string | null>) | null = null;

/** Wird von der Host-Auflösung gesetzt, sobald die Datenbank bereitsteht. */
export function setClubRequestResolver(fn: () => Promise<string | null>) {
  resolveFromRequest = fn;
}

/**
 * Verein dieser Ausführung.
 * Explizit gesetzt (Cron, Seed) hat Vorrang vor dem Host der Anfrage.
 * null = kein Verein (Plattform, Skript).
 */
export async function currentClubId(): Promise<string | null> {
  const stored = als.getStore();
  if (stored) return stored.clubId;
  if (!resolveFromRequest) return null;
  try {
    return await resolveFromRequest();
  } catch {
    return null;
  }
}

export function runWithClub<T>(clubId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ clubId }, fn);
}
