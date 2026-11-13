import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, { error: "Benutzername: mindestens 3 Zeichen." })
  .max(32, { error: "Benutzername: höchstens 32 Zeichen." })
  .regex(/^[a-zA-Z0-9._-]+$/, {
    error: "Benutzername: nur Buchstaben, Zahlen, Punkt, Unterstrich, Bindestrich.",
  });

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

/** Technischer Username aus E-Mail-Local-Part (nicht in der UI). */
export function usernameCandidateFromEmail(email: string) {
  const local = email.split("@")[0] ?? "user";
  let base = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 24);
  if (base.length < 3) {
    base = `u${base}${randomBytes(2).toString("hex")}`.slice(0, 24);
  }
  return base;
}

export async function allocateUniqueUsername(base: string): Promise<string> {
  const normalized = normalizeUsername(base).slice(0, 28) || "user";
  for (let i = 0; i < 40; i++) {
    const candidate =
      i === 0
        ? normalized
        : `${normalized.slice(0, 24)}${i.toString(36)}`.slice(0, 32);
    if (candidate.length < 3) continue;
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `u${randomBytes(12).toString("hex")}`.slice(0, 32);
}

export type UsernameAvailability =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "invalid"; message: string }
  | { state: "available" }
  | { state: "taken" };
