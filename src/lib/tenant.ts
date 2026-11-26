import { cache } from "react";
import { headers } from "next/headers";
import {
  CLUB_PREVIEW_HEADER,
  hostWithoutPort,
  isPlatformHost,
  normalizeHostHeader,
  platformDomain,
  slugFromHost,
  supportsClubSubdomains,
} from "@/lib/host";
import {
  currentClubId,
  runWithClub,
  setClubRequestResolver,
} from "@/lib/tenant-context";

export { currentClubId, runWithClub };
export {
  hostWithoutPort,
  isPlatformHost,
  platformDomain,
  slugFromHost,
  supportsClubSubdomains,
};

const LAJEN_SLUG = "lajen";
const hostCache = new Map<string, { at: number; clubId: string | null }>();
const slugCache = new Map<string, { at: number; clubId: string | null }>();
const HOST_CACHE_MS = 5_000;

export function clearClubHostCache() {
  hostCache.clear();
  slugCache.clear();
}

export type RequestHost =
  | { kind: "platform"; host: string }
  | { kind: "club"; host: string; clubId: string; slug: string; name: string }
  | { kind: "unknown"; host: string };

async function lookupClubBySlug(slug: string) {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  const cached = slugCache.get(key);
  if (cached && Date.now() - cached.at < HOST_CACHE_MS) {
    return cached.clubId;
  }
  const { prisma } = await import("@/lib/prisma");
  const club = await prisma.club.findUnique({
    where: { slug: key },
    select: { id: true, active: true },
  });
  const clubId = club?.active ? club.id : null;
  slugCache.set(key, { at: Date.now(), clubId });
  return clubId;
}

async function lookupClub(host: string) {
  const name = normalizeHostHeader(host);
  const cached = hostCache.get(name);
  if (cached && Date.now() - cached.at < HOST_CACHE_MS) {
    return cached.clubId;
  }
  const { prisma } = await import("@/lib/prisma");
  const byHost = await prisma.clubHost.findUnique({
    where: { host: name },
    select: { clubId: true, club: { select: { active: true } } },
  });
  if (byHost?.club.active) {
    hostCache.set(name, { at: Date.now(), clubId: byHost.clubId });
    return byHost.clubId;
  }
  const slug = slugFromHost(name);
  if (slug) {
    const clubId = await lookupClubBySlug(slug);
    hostCache.set(name, { at: Date.now(), clubId });
    return clubId;
  }
  hostCache.set(name, { at: Date.now(), clubId: null });
  return null;
}

async function previewSlugFromHeaders() {
  const headerList = await headers();
  const raw = headerList.get(CLUB_PREVIEW_HEADER)?.trim().toLowerCase() ?? "";
  if (!raw || raw.includes(".") || raw.includes("/")) return null;
  return raw;
}

setClubRequestResolver(async () => {
  const headerList = await headers();
  const host =
    headerList.get("x-club-host") ||
    headerList.get("x-forwarded-host") ||
    headerList.get("host") ||
    "";
  if (!host) return null;
  if (isPlatformHost(host)) {
    const preview = await previewSlugFromHeaders();
    if (!preview) return null;
    return lookupClubBySlug(preview);
  }
  return lookupClub(host);
});

export async function requestHostHeader() {
  const headerList = await headers();
  return normalizeHostHeader(
    headerList.get("x-club-host") ||
      headerList.get("x-forwarded-host") ||
      headerList.get("host") ||
      "",
  );
}

export const resolveRequestHost = cache(async (): Promise<RequestHost> => {
  const host = await requestHostHeader();
  if (!host) return { kind: "unknown", host: "" };

  if (isPlatformHost(host)) {
    const preview = await previewSlugFromHeaders();
    if (preview) {
      const clubId = await lookupClubBySlug(preview);
      if (clubId) {
        const { prisma } = await import("@/lib/prisma");
        const club = await prisma.club.findUnique({
          where: { id: clubId },
          select: { id: true, slug: true, name: true },
        });
        if (club) {
          return {
            kind: "club",
            host,
            clubId: club.id,
            slug: club.slug,
            name: club.name,
          };
        }
      }
    }
    return { kind: "platform", host };
  }

  const clubId = await lookupClub(host);
  if (!clubId) return { kind: "unknown", host };
  const { prisma } = await import("@/lib/prisma");
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true, name: true },
  });
  if (!club) return { kind: "unknown", host };
  return { kind: "club", host, clubId: club.id, slug: club.slug, name: club.name };
});

export async function requireCurrentClubId() {
  const id = await currentClubId();
  if (!id) throw new Error("Kein Verein im Kontext.");
  return id;
}

export async function listActiveClubs() {
  const { prisma } = await import("@/lib/prisma");
  return prisma.club.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { settings: true, hosts: true },
  });
}

export function clubPublicUrl(slug: string, requestHost?: string) {
  const domain = platformDomain();
  const port = requestHost?.includes(":")
    ? requestHost.split(":").pop()
    : "";
  if (!domain) {
    const withPort = port || "4521";
    return `http://${slug}.localhost:${withPort}`;
  }
  if (!supportsClubSubdomains(domain)) {
    // Ohne Wildcard (z. B. *.onrender.com): gleiche Host-Vorschau.
    return `https://${domain}`;
  }
  return `https://${slug}.${domain}`;
}

export function clubPublicUrlLabel(slug: string, requestHost?: string) {
  const url = clubPublicUrl(slug, requestHost);
  if (!supportsClubSubdomains()) {
    return `${url} (Vorschau: ${slug})`;
  }
  return url;
}

export async function platformBaseUrl() {
  const domain = platformDomain();
  if (domain && domain !== "0.0.0.0") {
    const host =
      domain === "onrender.com" || domain.endsWith(".onrender.com")
        ? domain
        : `www.${domain}`;
    return `https://${host}`;
  }
  const host = await requestHostHeader().catch(() => "");
  const normalized = normalizeHostHeader(host);
  const port = host.includes(":") ? host.split(":").pop() : "";
  const localPort =
    port && port !== "10000" && normalized !== "0.0.0.0" ? port : "4521";
  return `http://127.0.0.1:${localPort}`;
}

export const LAJEN_CLUB_SLUG = LAJEN_SLUG;

export function isLegacyClub(slug: string) {
  return slug === LAJEN_SLUG;
}
