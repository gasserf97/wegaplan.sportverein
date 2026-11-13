/**
 * Mitgliedschafts-Hinweise und -Pflicht bis 31.12.2026 ausblenden.
 * Ab 01.01.2027 00:00 Europe/Rome dauerhaft anzeigen / durchsetzen.
 *
 * Eigene Datei ohne Prisma – sicher in Client-Komponenten.
 */
export const MEMBERSHIP_NOTICES_FROM_MS = Date.parse(
  "2027-01-01T00:00:00+01:00",
);

export function shouldShowMembershipNotices(now = new Date()) {
  return now.getTime() >= MEMBERSHIP_NOTICES_FROM_MS;
}
