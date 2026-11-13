import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  renewedSessionToken,
  sessionCookieOptions,
  sessionCookieSecure,
} from "@/lib/session-token";

/** Forward pathname so the root layout can enforce the Stammdaten gate. */
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

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
