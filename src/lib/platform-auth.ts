import { cache } from "react";
import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionSecret } from "@/lib/session-token";

export const PLATFORM_COOKIE = "platform_session";

export type PlatformAdminSession = {
  id: string;
  username: string;
  name: string;
  email: string;
};

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export async function ensurePlatformAdmin() {
  const existing = await prisma.platformAdmin.count();
  if (existing > 0) return;
  const username = process.env.PLATFORM_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() || `${username ?? "admin"}@platform.local`;
  if (!username || password.length < 8) return;
  await prisma.platformAdmin.create({
    data: {
      username,
      name: "Betreiber",
      email,
      passwordHash: await hash(password, 10),
    },
  });
}

export async function setPlatformSession(admin: PlatformAdminSession) {
  const token = await new SignJWT({
    sub: admin.id,
    username: admin.username,
    name: admin.name,
    email: admin.email,
    kind: "platform",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSessionSecret());
  const store = await cookies();
  store.set(PLATFORM_COOKIE, token, cookieOptions());
}

export async function clearPlatformSession() {
  const store = await cookies();
  store.delete({ name: PLATFORM_COOKIE, path: "/" });
}

export const getPlatformAdmin = cache(async (): Promise<PlatformAdminSession | null> => {
  const store = await cookies();
  const token = store.get(PLATFORM_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    if (payload.kind !== "platform" || typeof payload.sub !== "string") return null;
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, name: true, email: true },
    });
    return admin;
  } catch {
    return null;
  }
});

export async function loginPlatformAdmin(login: string, password: string) {
  await ensurePlatformAdmin();
  const value = login.trim().toLowerCase();
  const admin = await prisma.platformAdmin.findFirst({
    where: {
      OR: [{ username: value }, { email: value }],
    },
  });
  if (!admin) return null;
  const ok = await compare(password, admin.passwordHash);
  if (!ok) return null;
  return {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    email: admin.email,
  } satisfies PlatformAdminSession;
}

export async function createPlatformEnterToken(input: {
  userId: string;
  platformAdminId: string;
}) {
  return new SignJWT({
    purpose: "platform-enter",
    platformAdminId: input.platformAdminId,
  })
    .setSubject(input.userId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSessionSecret());
}

export async function readPlatformEnterToken(token: string) {
  const { payload } = await jwtVerify(token, getSessionSecret());
  if (payload.purpose !== "platform-enter") return null;
  if (typeof payload.sub !== "string") return null;
  if (typeof payload.platformAdminId !== "string") return null;
  return { userId: payload.sub, platformAdminId: payload.platformAdminId };
}
