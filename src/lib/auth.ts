import { cache } from "react";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  CLIENT_CHANNEL_COOKIE,
  parseClientChannel,
  type ClientChannel,
} from "@/lib/client-channel";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionSecret,
  sessionCookieOptions,
  sessionCookieSecure,
} from "@/lib/session-token";

export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_DAYS,
  createSessionToken,
  sessionCookieOptions,
  sessionCookieSecure,
} from "@/lib/session-token";

const COOKIE_NAME = SESSION_COOKIE_NAME;

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
};

export type ImpersonationContext = {
  adminId: string;
  adminName: string;
  targetId: string;
  targetName: string;
};

type SessionClaims = {
  userId: string;
  impersonatorId: string | null;
};

/** Merkt App-Aktivität für die Statistik – höchstens alle 30 Sekunden. */
const PRESENCE_TOUCH_MS = 30_000;

export async function readRequestClientChannel(): Promise<ClientChannel | null> {
  const store = await cookies();
  return parseClientChannel(store.get(CLIENT_CHANNEL_COOKIE)?.value);
}

async function touchDailyPresence(
  userId: string,
  lastLoginAt: Date | null,
  lastClient: string | null,
  alsoVerifyEmail: boolean,
) {
  const now = new Date();
  const stale =
    !lastLoginAt || now.getTime() - lastLoginAt.getTime() >= PRESENCE_TOUCH_MS;
  const channel = await readRequestClientChannel();
  const clientChanged = channel != null && channel !== lastClient;
  if (!stale && !alsoVerifyEmail && !clientChanged) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(stale ? { lastLoginAt: now } : {}),
      ...(clientChanged && channel ? { lastClient: channel } : {}),
      ...(alsoVerifyEmail ? { emailVerifiedAt: now } : {}),
    },
  });

  if (stale) {
    const { recordConcurrentUsersSample } = await import(
      "@/lib/concurrent-users"
    );
    void recordConcurrentUsersSample().catch((error) => {
      console.error("Gleichzeitige User merken fehlgeschlagen", error);
    });
  }
}

async function readSessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    const impersonatorId =
      typeof payload.imp === "string" && payload.imp.length > 0
        ? payload.imp
        : null;
    return { userId, impersonatorId };
  } catch {
    return null;
  }
}

export async function setSessionCookie(
  user: {
    id: string;
    username: string;
    name: string;
    email: string;
    role: "USER" | "ADMIN";
  },
  options?: { impersonatorId?: string },
) {
  const token = await createSessionToken(user, options);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    secure: sessionCookieSecure(),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete({ name: COOKIE_NAME, path: "/" });
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const claims = await readSessionClaims();
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      lastClient: true,
    },
  });
  if (!user) return null;

  // Simulation darf die Aktivitätsstatistik des Mitglieds nicht verfälschen.
  if (!claims.impersonatorId) {
    try {
      await touchDailyPresence(
        user.id,
        user.lastLoginAt,
        user.lastClient,
        !user.emailVerifiedAt,
      );
    } catch (error) {
      console.error("Aktivität speichern fehlgeschlagen", error);
    }
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
  };
});

export const getImpersonationContext = cache(
  async (): Promise<ImpersonationContext | null> => {
    const claims = await readSessionClaims();
    if (!claims?.impersonatorId) return null;

    const [admin, target] = await Promise.all([
      prisma.user.findUnique({
        where: { id: claims.impersonatorId },
        select: { id: true, name: true, role: true },
      }),
      prisma.user.findUnique({
        where: { id: claims.userId },
        select: { id: true, name: true },
      }),
    ]);

    if (!admin || admin.role !== "ADMIN" || !target) return null;

    return {
      adminId: admin.id,
      adminName: admin.name,
      targetId: target.id,
      targetName: target.name,
    };
  },
);

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user;
}

/** Haupt-Admin. Rechte gelten für die aktuelle Person (auch in der Simulation). */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

/** Kurs-/Sektionsverwaltung. Rechte gelten für die aktuelle Person (auch in der Simulation). */
export async function requireCourseManager() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role === "ADMIN") return user;

  const { canAccessCourseAdmin } = await import("@/lib/permissions");
  if (await canAccessCourseAdmin(user)) return user;
  return null;
}

/** Liest den JWT-Impersonator für Start/Stop-Actions (ohne getCurrentUser-Cache). */
export async function getSessionImpersonatorId() {
  const claims = await readSessionClaims();
  return claims?.impersonatorId ?? null;
}
