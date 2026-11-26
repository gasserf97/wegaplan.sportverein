export function hostWithoutPort(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
}

/** Ersten Host aus ggf. kommasepariertem Header nehmen. */
export function normalizeHostHeader(value: string) {
  return hostWithoutPort((value.split(",")[0] ?? "").trim());
}

function isBindOnlyHostname(host: string) {
  const name = normalizeHostHeader(host);
  return name === "0.0.0.0" || name === "::" || name === "[::]";
}

function isOnrenderHost(host: string) {
  return host === "onrender.com" || host.endsWith(".onrender.com");
}

/** www.wegaclub.com und wegaclub.com sind dieselbe Betreiber-Domain. */
function bareDomain(host: string) {
  return host.startsWith("www.") ? host.slice(4) : host;
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
 * Öffentliche Domain der Vereine, ohne www.
 * wegaplan.onrender.com ist nur der Server und zählt hier nicht:
 * sonst wäre www.wegaclub.com kein Betreiber-Host.
 */
export function platformDomain() {
  const configured = normalizeHostHeader(process.env.PLATFORM_DOMAIN ?? "");
  const cleaned =
    configured && !isBindOnlyHostname(configured)
      ? bareDomain(hostFromUrl(configured) || configured)
      : "";
  if (cleaned && !isOnrenderHost(cleaned)) return cleaned;

  const fromApp = bareDomain(hostFromUrl(process.env.NEXT_PUBLIC_APP_URL));
  if (fromApp && !isBindOnlyHostname(fromApp) && !isOnrenderHost(fromApp)) return fromApp;

  // Auf Render bleibt die öffentliche Domain wegaclub.com, auch solange
  // PLATFORM_DOMAIN im Dashboard noch auf dem Service-Host steht.
  if (process.env.RENDER === "true" || process.env.RENDER_EXTERNAL_HOSTNAME) {
    return "wegaclub.com";
  }

  if (cleaned) return cleaned;
  const fromRender = hostWithoutPort(process.env.RENDER_EXTERNAL_HOSTNAME ?? "");
  if (fromRender && !isBindOnlyHostname(fromRender)) return fromRender;
  const fromUrl = hostFromUrl(process.env.RENDER_EXTERNAL_URL);
  if (fromUrl && !isBindOnlyHostname(fromUrl)) return fromUrl;
  return "";
}

/**
 * Öffentliche Origin für Redirects.
 * Auf Render ist request.url oft http://0.0.0.0:10000/ – das darf nie in Location stehen.
 */
export function publicOriginFromRequest(request: Request) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("x-club-host") ||
    "";
  const hostHeader = request.headers.get("host") || "";
  const hostCandidate = [forwardedHost, hostHeader]
    .map((value) => (value.split(",")[0] ?? "").trim())
    .find((value) => value && !isBindOnlyHostname(value));

  const protoHeader = (
    request.headers.get("x-forwarded-proto") || ""
  )
    .split(",")[0]
    ?.trim()
    .toLowerCase();

  if (hostCandidate) {
    const host = hostCandidate.toLowerCase();
    const isLocal =
      normalizeHostHeader(host) === "localhost" ||
      normalizeHostHeader(host) === "127.0.0.1" ||
      normalizeHostHeader(host).endsWith(".localhost");
    const proto =
      protoHeader === "http" || protoHeader === "https"
        ? protoHeader
        : isLocal
          ? "http"
          : "https";
    return `${proto}://${host}`;
  }

  const domain = platformDomain();
  if (domain) return `https://${domain}`;

  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "";
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* ignore */
    }
  }

  try {
    const fallback = new URL(request.url);
    if (!isBindOnlyHostname(fallback.hostname)) return fallback.origin;
  } catch {
    /* ignore */
  }
  return "http://127.0.0.1:4521";
}

export function publicUrlFromRequest(request: Request, pathname: string) {
  return new URL(pathname, `${publicOriginFromRequest(request)}/`);
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
  if (domain && (name === domain || name === `www.${domain}`)) return true;
  const renderHost = hostWithoutPort(process.env.RENDER_EXTERNAL_HOSTNAME ?? "");
  if (renderHost && name === renderHost) return true;
  return false;
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
