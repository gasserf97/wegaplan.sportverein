export function hostWithoutPort(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
}

/** Ersten Host aus ggf. kommasepariertem Header nehmen. */
export function normalizeHostHeader(value: string) {
  return hostWithoutPort((value.split(",")[0] ?? "").trim());
}

function hostFromUrl(value: string | undefined) {
  if (!value?.trim()) return "";
  try {
    return hostWithoutPort(new URL(value).host);
  } catch {
    return hostWithoutPort(value.replace(/^https?:\/\//, "").split("/")[0] ?? "");
  }
}

/**
 * Hauptdomain des Betreibers. Explizit PLATFORM_DOMAIN, sonst Render-/App-URL
 * (damit wegaplan.onrender.com ohne Extra-Env als Super-Admin funktioniert).
 */
export function platformDomain() {
  const configured = normalizeHostHeader(process.env.PLATFORM_DOMAIN ?? "");
  if (configured) {
    // Falls jemand https://… einträgt
    return hostFromUrl(configured) || configured;
  }
  const fromRender = hostWithoutPort(process.env.RENDER_EXTERNAL_HOSTNAME ?? "");
  if (fromRender) return fromRender;
  return (
    hostFromUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    hostFromUrl(process.env.RENDER_EXTERNAL_URL)
  );
}

/** Render-*.onrender.com erlaubt keine Wildcard-Subdomains. */
export function supportsClubSubdomains(domain = platformDomain()) {
  if (!domain) return true;
  return !domain.endsWith(".onrender.com") && domain !== "onrender.com";
}

export function isPlatformHost(host: string) {
  const name = normalizeHostHeader(host);
  if (name === "localhost" || name === "127.0.0.1") return true;
  const domain = platformDomain();
  if (!domain) return false;
  return name === domain || name === `www.${domain}`;
}

/** Subdomain vor der Plattform-Domain oder `slug.localhost`. */
export function slugFromHost(host: string): string | null {
  const name = normalizeHostHeader(host);
  if (name.endsWith(".localhost")) {
    const slug = name.slice(0, -".localhost".length);
    if (slug && !slug.includes(".")) return slug;
    return null;
  }
  const domain = platformDomain();
  if (!domain) return null;
  const suffix = `.${domain}`;
  if (!name.endsWith(suffix)) return null;
  const slug = name.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || slug === "www") return null;
  return slug;
}

/** Cookie + Header: Verein auf der Hauptdomain testen, ohne Subdomain. */
export const CLUB_PREVIEW_COOKIE = "club_preview";
export const CLUB_PREVIEW_HEADER = "x-club-preview";
