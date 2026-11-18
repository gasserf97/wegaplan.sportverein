export function hostWithoutPort(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
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
  const configured = hostWithoutPort(process.env.PLATFORM_DOMAIN ?? "");
  if (configured) return configured;
  const fromRender = hostWithoutPort(process.env.RENDER_EXTERNAL_HOSTNAME ?? "");
  if (fromRender) return fromRender;
  return (
    hostFromUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    hostFromUrl(process.env.RENDER_EXTERNAL_URL)
  );
}

export function isPlatformHost(host: string) {
  const name = hostWithoutPort(host);
  if (name === "localhost" || name === "127.0.0.1") return true;
  const domain = platformDomain();
  if (!domain) return false;
  return name === domain || name === `www.${domain}`;
}

/** Subdomain vor der Plattform-Domain oder `slug.localhost`. */
export function slugFromHost(host: string): string | null {
  const name = hostWithoutPort(host);
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
