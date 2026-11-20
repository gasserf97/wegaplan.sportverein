import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import {
  CLUB_PREVIEW_COOKIE,
  publicUrlFromRequest,
  supportsClubSubdomains,
} from "@/lib/host";
import { readPlatformEnterToken } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { sessionCookieSecure } from "@/lib/session-token";
import { slugFromHost } from "@/lib/tenant";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return new Response("Token fehlt", { status: 400 });

  let claims: { userId: string; platformAdminId: string } | null = null;
  try {
    claims = await readPlatformEnterToken(token);
  } catch {
    return new Response("Token ungültig", { status: 400 });
  }
  if (!claims) return new Response("Token ungültig", { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      clubId: true,
      club: { select: { slug: true, active: true } },
    },
  });
  if (!user || user.role !== "ADMIN" || !user.club.active) {
    return new Response("Admin nicht gefunden", { status: 403 });
  }

  const requestedSlug = (url.searchParams.get("club") ?? "").trim().toLowerCase();
  const forwardedHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;
  const hostSlug = slugFromHost(forwardedHost);

  if (requestedSlug && requestedSlug !== user.club.slug) {
    return new Response("Admin gehört nicht zu diesem Verein", { status: 403 });
  }
  if (hostSlug && hostSlug !== user.club.slug) {
    return new Response("Admin gehört nicht zu diesem Verein", { status: 403 });
  }
  // Ohne Subdomain und ohne ?club= nur erlauben, wenn Same-Host-Vorschau vorgesehen ist.
  if (!hostSlug && !requestedSlug && supportsClubSubdomains()) {
    return new Response("Verein im Host fehlt", { status: 400 });
  }

  await setSessionCookie(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    { platformImpersonatorId: claims.platformAdminId },
  );

  const response = NextResponse.redirect(publicUrlFromRequest(request, "/"));
  // Same-Host-Vorschau (z. B. wegaplan.onrender.com) braucht den Cookie.
  if (!supportsClubSubdomains() || requestedSlug) {
    response.cookies.set(CLUB_PREVIEW_COOKIE, user.club.slug, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: sessionCookieSecure(),
      maxAge: 60 * 60 * 12,
    });
  }
  return response;
}
