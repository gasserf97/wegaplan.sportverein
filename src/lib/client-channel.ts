import { isStandalonePwa } from "@/lib/pwa-install";

export const CLIENT_CHANNEL_COOKIE = "asc-client";

export type ClientChannel = "PWA" | "BROWSER";

export function parseClientChannel(
  value: string | null | undefined,
): ClientChannel | null {
  if (value === "PWA" || value === "BROWSER") return value;
  return null;
}

/** Merkt den aktuellen Zugang im Cookie, damit Login und Aktivität ihn speichern können. */
export function rememberClientChannel() {
  if (typeof document === "undefined") return;
  const channel: ClientChannel = isStandalonePwa() ? "PWA" : "BROWSER";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CLIENT_CHANNEL_COOKIE}=${channel}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
