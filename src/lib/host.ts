export function hostWithoutPort(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
}

export function platformDomain() {
  return hostWithoutPort(process.env.PLATFORM_DOMAIN ?? "");
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
