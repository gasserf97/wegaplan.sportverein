import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "kurswerk_session";
/** Gültigkeit ab der letzten Verlängerung. */
export const SESSION_MAX_AGE_DAYS = 30;
/**
 * Cookie erst neu ausstellen, wenn die Sitzung mindestens so alt ist.
 * Jede Nutzung davor liegt noch innerhalb derselben 30 Tage.
 */
export const SESSION_REFRESH_AFTER_SECONDS = 5 * 60;

const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  };
}

export function sessionCookieSecure() {
  return process.env.NODE_ENV === "production";
}

export function getSessionSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET fehlt.");
  }
  return new TextEncoder().encode(secret);
}

type SessionIdentity = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
};

export async function createSessionToken(
  user: SessionIdentity,
  options?: { impersonatorId?: string },
) {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(options?.impersonatorId ? { imp: options.impersonatorId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_DAYS}d`)
    .sign(getSessionSecret());
}

/** Neues 30-Tage-Token, wenn die aktuelle Sitzung schon etwas her ist. Sonst null. */
export async function renewedSessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const iat = typeof payload.iat === "number" ? payload.iat : 0;
    const ageSeconds = Math.floor(Date.now() / 1000) - iat;
    if (ageSeconds < SESSION_REFRESH_AFTER_SECONDS) return null;

    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;

    const impersonatorId =
      typeof payload.imp === "string" && payload.imp.length > 0
        ? payload.imp
        : undefined;

    return createSessionToken(
      {
        id: userId,
        username: typeof payload.username === "string" ? payload.username : "",
        name: typeof payload.name === "string" ? payload.name : "",
        email: typeof payload.email === "string" ? payload.email : "",
        role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      },
      impersonatorId ? { impersonatorId } : undefined,
    );
  } catch {
    return null;
  }
}
