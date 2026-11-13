import type { User } from "@/generated/prisma/client";
import { SignJWT, jwtVerify, errors as JoseErrors } from "jose";
import { prisma } from "@/lib/prisma";
import {
  sendAccountInviteEmail,
  sendVerificationEmail,
  verificationLink,
} from "@/lib/mail";

const VERIFY_HOURS = 48;
const PURPOSE = "email_verify";

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET fehlt.");
  }
  return new TextEncoder().encode(secret);
}

/** Token aus URL/E-Mail säubern. */
export function normalizeVerifyToken(raw: string | null | undefined) {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/[),.;]+$/g, "")
    .trim();
}

export type EmailVerificationResult = {
  email: string;
  confirmUrl: string;
  sent: boolean;
  error?: string;
};

export type VerifyTokenLookup =
  | { status: "ok"; user: User }
  | { status: "missing" }
  | { status: "expired" };

/** Signierter Link-Token (kein DB-Lookup nötig – behebt „Link ungültig“). */
async function createVerifyJwt(userId: string) {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${VERIFY_HOURS}h`)
    .sign(getAuthSecret());
}

export async function findUserByVerifyToken(token: string) {
  const result = await lookupVerifyToken(token);
  return result.status === "ok" ? result.user : null;
}

export async function lookupVerifyToken(
  rawToken: string,
): Promise<VerifyTokenLookup> {
  const token = normalizeVerifyToken(rawToken);
  if (!token) return { status: "missing" };

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") {
      return { status: "missing" };
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.canLogin) {
      return { status: "missing" };
    }
    return { status: "ok", user };
  } catch (error) {
    if (
      error instanceof JoseErrors.JWTExpired ||
      (error instanceof Error && error.name === "JWTExpired")
    ) {
      return { status: "expired" };
    }
    console.warn("Verify-JWT ungültig", {
      tokenLength: token.length,
      name: error instanceof Error ? error.name : "unknown",
    });
    return { status: "missing" };
  }
}

async function issueLink(
  userId: string,
  email: string,
  nextPath: string | undefined,
  send: (confirmUrl: string) => Promise<{ sent: boolean; message?: string }>,
): Promise<EmailVerificationResult> {
  const token = await createVerifyJwt(userId);
  // Merker für UI/Admin: offener Bestätigungslink (kein Lookup mehr darüber).
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken: `jwt:${userId}`,
      emailVerifyExpiresAt: new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000),
    },
  });

  const confirmUrl = await verificationLink(token, nextPath);
  const delivery = await send(confirmUrl);
  if (delivery.sent) {
    return { email, confirmUrl, sent: true };
  }
  return {
    email,
    confirmUrl,
    sent: false,
    error: delivery.message,
  };
}

export async function issueEmailVerification(
  userId: string,
  nextPath?: string,
): Promise<EmailVerificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw new Error("Benutzer nicht gefunden.");

  const result = await issueLink(userId, user.email, nextPath, (url) =>
    sendVerificationEmail(user.email, url),
  );
  if (!result.sent) {
    console.error("Bestätigungsmail", user.email, result.error);
  }
  return result;
}

/** Familien-Einladung: Account angelegt + Link zum Passwort setzen. */
export async function issueAccountInvite(
  userId: string,
  nextPath?: string,
): Promise<EmailVerificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) throw new Error("Benutzer nicht gefunden.");

  const result = await issueLink(userId, user.email, nextPath, (url) =>
    sendAccountInviteEmail(user.email, user.name, url),
  );
  if (!result.sent) {
    console.error("Einladungsmail", user.email, result.error);
  }
  return result;
}

export async function verifyEmailToken(token: string) {
  const user = await findUserByVerifyToken(token);
  if (!user) return null;

  return prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
    },
  });
}
