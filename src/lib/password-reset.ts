import { createHash } from "node:crypto";
import type { User } from "@/generated/prisma/client";
import { SignJWT, jwtVerify, errors as JoseErrors } from "jose";
import { normalizeVerifyToken } from "@/lib/email-verification";
import { PASSWORD_RESET_HOURS } from "@/lib/password-reset-config";
import { prisma } from "@/lib/prisma";

const PURPOSE = "password_reset";

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET fehlt.");
  }
  return new TextEncoder().encode(secret);
}

/** Bindet den Link an das aktuelle Passwort. Nach dem Setzen wird er ungültig. */
function passwordFingerprint(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 22);
}

export async function createPasswordResetToken(user: {
  id: string;
  passwordHash: string;
}) {
  return new SignJWT({
    purpose: PURPOSE,
    pv: passwordFingerprint(user.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${PASSWORD_RESET_HOURS}h`)
    .sign(getAuthSecret());
}

export type PasswordResetLookup =
  | { status: "ok"; user: User }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "used" };

export async function lookupPasswordResetToken(
  rawToken: string,
): Promise<PasswordResetLookup> {
  const token = normalizeVerifyToken(rawToken);
  if (!token) return { status: "missing" };

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") {
      return { status: "missing" };
    }

    const fingerprint = typeof payload.pv === "string" ? payload.pv : "";
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.canLogin || !fingerprint) {
      return { status: "missing" };
    }
    if (passwordFingerprint(user.passwordHash) !== fingerprint) {
      return { status: "used" };
    }
    return { status: "ok", user };
  } catch (error) {
    if (
      error instanceof JoseErrors.JWTExpired ||
      (error instanceof Error && error.name === "JWTExpired")
    ) {
      return { status: "expired" };
    }
    return { status: "missing" };
  }
}
