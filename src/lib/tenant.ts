import { cache } from "react";
import { headers } from "next/headers";
import {
  hostWithoutPort,
  isPlatformHost,
  platformDomain,
  slugFromHost,
} from "@/lib/host";
import {
  currentClubId,
  runWithClub,
  setClubRequestResolver,
} from "@/lib/tenant-context";

export { currentClubId, runWithClub };
export { hostWithoutPort, isPlatformHost, platformDomain, slugFromHost };

const LAJEN_SLUG = "lajen";
const hostCache = new Map<string, { at: number; clubId: string | null }>();
const HOST_CACHE_MS = 5_000;

export function clearClubHostCache() {
  hostCache.clear();
}

export type RequestHost =
  | { kind: "platform"; host: string }
  | { kind: "club"; host: string; clubId: string; slug: string; name: string }
  | { kind: "unknown"; host: string };

async function lookupClub(host: string) {
  const name = hostWithoutPort(host);
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
    const club = await prisma.club.findUnique({
      where: { slug },
      select: { id: true, active: true },
    });
    if (club?.active) {
      hostCache.set(name, { at: Date.now(), clubId: club.id });
      return club.id;
    }
  }
  hostCache.set(name, { at: Date.now(), clubId: null });
  return null;
}

setClubRequestResolver(async () => {
  const headerList = await headers();
  const host =
    headerList.get("x-club-host") ||
    headerList.get("x-forwarded-host") ||
    headerList.get("host") ||
    "";
  if (!host || isPlatformHost(host)) return null;
  return lookupClub(host);
});

export async function requestHostHeader() {
  const headerList = await headers();
  return hostWithoutPort(
    headerList.get("x-club-host") ||
      headerList.get("x-forwarded-host") ||
      headerList.get("host") ||
      "",
  );
}

export const resolveRequestHost = cache(async (): Promise<RequestHost> => {
  const host = await requestHostHeader();
  if (!host || isPlatformHost(host)) return { kind: "platform", host };
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
  return `https://${slug}.${domain}`;
}

export async function platformBaseUrl() {
  const domain = platformDomain();
  const host = await requestHostHeader().catch(() => "");
  const port = host.includes(":") ? host.split(":").pop() : "";
  if (!domain) {
    return `http://127.0.0.1:${port || "4521"}`;
  }
  return `https://${domain}`;
}

export const LAJEN_CLUB_SLUG = LAJEN_SLUG;

export function isLegacyClub(slug: string) {
  return slug === LAJEN_SLUG;
}
