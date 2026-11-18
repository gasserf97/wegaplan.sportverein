import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  renewedSessionToken,
  sessionCookieOptions,
  sessionCookieSecure,
} from "@/lib/session-token";

import {
  CLUB_PREVIEW_COOKIE,
  CLUB_PREVIEW_HEADER,
  isPlatformHost,
  normalizeHostHeader,
  publicUrlFromRequest,
  slugFromHost,
} from "@/lib/host";

/** Forward pathname so the root layout can enforce the Stammdaten gate. */
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const host = normalizeHostHeader(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "",
  );
  requestHeaders.set("x-club-host", host);

  const preview = request.cookies.get(CLUB_PREVIEW_COOKIE)?.value?.trim().toLowerCase() ?? "";
  if (preview && !preview.includes(".") && !preview.includes("/")) {
    requestHeaders.set(CLUB_PREVIEW_HEADER, preview);
  }

  const path = request.nextUrl.pathname;
  const onPlatform = isPlatformHost(host);

  if (request.method === "GET" && onPlatform && path.startsWith("/vereine")) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    // Plattform-UI: Vorschau-Cookie löschen, damit /vereine wieder Betreiber ist.
    response.cookies.set(CLUB_PREVIEW_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: sessionCookieSecure(),
      maxAge: 0,
    });
    return withSessionRenewal(request, response);
  }

  if (
    request.method === "GET" &&
    onPlatform &&
    !preview &&
    !path.startsWith("/vereine") &&
    !path.startsWith("/api")
  ) {
    return NextResponse.redirect(publicUrlFromRequest(request, "/vereine"));
  }
  if (request.method === "GET" && slugFromHost(host) && path.startsWith("/vereine")) {
    return NextResponse.redirect(publicUrlFromRequest(request, "/"));
  }
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return withSessionRenewal(request, response);
}

async function withSessionRenewal(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return response;

  const renewed = await renewedSessionToken(token);
  if (!renewed) return response;

  response.cookies.set(SESSION_COOKIE_NAME, renewed, {
    ...sessionCookieOptions(),
    secure: sessionCookieSecure(),
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\..*).*)",
  ],
};
