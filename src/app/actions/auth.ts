"use server";

import { randomBytes } from "node:crypto";
import { hash, compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  clearSessionCookie,
  readRequestClientChannel,
  setSessionCookie,
} from "@/lib/auth";
import {
  findUserByVerifyToken,
  issueEmailVerification,
} from "@/lib/email-verification";
import { getServerI18n } from "@/lib/i18n";
import {
  isLoginLocked,
  lockoutRemainingMinutes,
  nextFailedLoginState,
} from "@/lib/login-lockout";
import { isSendableEmail, passwordResetLink, sendPasswordResetEmail } from "@/lib/mail";
import { createPasswordResetToken, lookupPasswordResetToken } from "@/lib/password-reset";
import { PASSWORD_RESET_HOURS } from "@/lib/password-reset-config";
import {
  emailSchema,
  incompleteProfilePlaceholders,
  isFamilyEmailPlaceholder,
} from "@/lib/profile";
import { findProfileConflict } from "@/lib/profile-db";
import { isUserProfileComplete } from "@/lib/profile-gate";
import {
  allocateUniqueUsername,
  normalizeUsername,
  usernameCandidateFromEmail,
  usernameSchema,
  type UsernameAvailability,
} from "@/lib/username";

export type RegisterDraftFields = {
  email: string;
  acceptPrivacy: boolean;
};

export type AuthState =
  | { error: string; fields?: RegisterDraftFields }
  | { success: true; next: string }
  | { pendingVerification: true; email: string; resent?: boolean }
  | null;

export type ResendState = { error: string } | { ok: true } | null;

export type ConfirmEmailState =
  | { error: string }
  | { success: true; next: string }
  | null;

const registerSchema = z.object({
  email: emailSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Bitte Ihr Passwort eingeben." }),
});

const setPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, { error: "Mindestens 8 Zeichen." }),
    passwordConfirm: z
      .string()
      .min(1, { error: "Bitte das Passwort wiederholen." }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["passwordConfirm"],
  });

async function findUserForLogin(email: string) {
  const lowered = email.trim().toLowerCase();
  return prisma.user.findFirst({
    where: { email: { equals: lowered, mode: "insensitive" } },
  });
}

function safeNextPath(value: FormDataEntryValue | null | undefined) {
  if (typeof value !== "string") return "/konto/familie";
  if (!value.startsWith("/") || value.startsWith("//")) return "/konto/familie";
  return value;
}

/** Incomplete Stammdaten always go to family setup first. */
async function resolvePostAuthPath(
  userId: string,
  requestedNext: FormDataEntryValue | null | undefined,
) {
  if (!(await isUserProfileComplete(userId))) {
    return "/konto/familie";
  }
  return safeNextPath(requestedNext);
}

async function recordLastLogin(userId: string) {
  const lastClient = await readRequestClientChannel();
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      loginLockedUntil: null,
      ...(lastClient ? { lastClient } : {}),
    },
  });
}

function loginLockedMessage(
  t: Awaited<ReturnType<typeof getServerI18n>>["t"],
  lockedUntil: Date,
) {
  const minutes = lockoutRemainingMinutes(lockedUntil);
  if (minutes === 1) return t("auth.loginLockedOne");
  return t("auth.loginLocked", { minutes });
}

function registerError(error: string, formData: FormData): AuthState {
  return {
    error,
    fields: {
      email: String(formData.get("email") ?? ""),
      acceptPrivacy: formData.get("acceptPrivacy") === "on",
    },
  };
}

export async function checkUsernameAvailabilityAction(
  raw: string,
  excludeUserId?: string,
): Promise<UsernameAvailability> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { state: "empty" };
  }

  const parsed = usernameSchema.safeParse(trimmed);
  if (!parsed.success) {
    return {
      state: "invalid",
      message: parsed.error.issues[0]?.message ?? "Ungültiger Benutzername.",
    };
  }

  const existing = await prisma.user.findUnique({
    where: { username: normalizeUsername(parsed.data) },
    select: { id: true },
  });

  if (existing && existing.id !== excludeUserId) {
    return { state: "taken" };
  }
  return { state: "available" };
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (formData.get("acceptPrivacy") !== "on") {
    return registerError(
      "Bitte die Datenschutzbestimmungen bestätigen.",
      formData,
    );
  }

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return registerError(
      parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
      formData,
    );
  }

  const email = parsed.data.email;
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  // Nur blockieren, wenn das Konto fertig ist (E-Mail bestätigt, kein offener Link).
  // Sonst: erneut registrieren = neuen Bestätigungslink senden (gleiche E-Mail).
  const fullyRegistered =
    Boolean(existing?.emailVerifiedAt) && !existing?.emailVerifyToken;
  if (fullyRegistered) {
    return registerError(
      "Diese E-Mail-Adresse ist bereits registriert. Bitte anmelden.",
      formData,
    );
  }

  let userId = existing?.id;
  const isResend = Boolean(existing);

  if (!existing) {
    const username = await allocateUniqueUsername(
      usernameCandidateFromEmail(email),
    );
    const placeholders = incompleteProfilePlaceholders(
      randomBytes(8).toString("hex"),
    );
    const conflict = await findProfileConflict({
      email,
      taxId: placeholders.taxId,
    });
    if (conflict) return registerError(conflict, formData);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        ...placeholders,
        passwordHash: await hash(randomBytes(32).toString("hex"), 10),
        canLogin: true,
        emailVerifiedAt: null,
      },
    });
    userId = user.id;
  }

  if (!userId) {
    return registerError("Registrierung fehlgeschlagen.", formData);
  }

  const issued = await issueEmailVerification(userId, "/konto/familie");
  if (!issued.sent) {
    return registerError(
      issued.error ??
        "Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.",
      formData,
    );
  }

  return { pendingVerification: true, email, resent: isResend };
}

export async function resendVerificationAction(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Bitte eine gültige E-Mail-Adresse angeben.",
    };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data, mode: "insensitive" } },
  });
  if (!user) {
    return { ok: true };
  }
  if (user.emailVerifiedAt && !user.emailVerifyToken) {
    return { ok: true };
  }

  await issueEmailVerification(user.id, "/konto/familie");
  return { ok: true };
}

export async function setPasswordAfterVerifyAction(
  _prev: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  const parsed = setPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
    };
  }

  const user = await findUserByVerifyToken(parsed.data.token);
  if (!user) {
    return {
      error:
        "Link ungültig oder abgelaufen. Bitte erneut registrieren oder Einladung anfordern.",
    };
  }
  if (!user.canLogin) {
    return { error: "Dieses Konto hat keinen Plattformzugang." };
  }

  const passwordHash = await hash(parsed.data.password, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      emailVerifiedAt: new Date(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
    },
  });

  await setSessionCookie({
    id: updated.id,
    username: updated.username,
    name: updated.name,
    email: updated.email,
    role: updated.role,
  });
  await recordLastLogin(updated.id);

  redirect(await resolvePostAuthPath(updated.id, formData.get("next")));
}

export async function confirmEmailAction(
  _prev: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  return setPasswordAfterVerifyAction(_prev, formData);
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." };
  }

  const user = await findUserForLogin(parsed.data.email);

  const lockedUntil = user?.loginLockedUntil ?? null;
  if (user && lockedUntil && isLoginLocked(lockedUntil)) {
    const { t } = await getServerI18n();
    return { error: loginLockedMessage(t, lockedUntil) };
  }

  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    if (user) {
      const next = nextFailedLoginState(user.failedLoginCount);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: next.failedLoginCount,
          loginLockedUntil: next.loginLockedUntil,
        },
      });
      if (next.justLocked && next.loginLockedUntil) {
        const { t } = await getServerI18n();
        return { error: loginLockedMessage(t, next.loginLockedUntil) };
      }
    }
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  if (user.failedLoginCount > 0 || user.loginLockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, loginLockedUntil: null },
    });
  }

  if (!user.canLogin) {
    return {
      error:
        "Dieses Familienmitglied hat keinen eigenen Zugang. Bitte mit dem Familienkonto anmelden.",
    };
  }

  if (!user.emailVerifiedAt) {
    return {
      error:
        "Bitte zuerst den Link in der Bestätigungs-E-Mail öffnen und ein Passwort festlegen.",
    };
  }

  await setSessionCookie({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  await recordLastLogin(user.id);

  redirect(await resolvePostAuthPath(user.id, formData.get("next")));
}

export type PasswordResetRequestState =
  | { error: string }
  | { sent: true; email: string }
  | null;

export async function requestPasswordResetAction(
  _prev: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const { t } = await getServerI18n();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: t("auth.invalidEmail") };
  }

  const email = parsed.data;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (
    user?.canLogin &&
    isSendableEmail(user.email) &&
    !isFamilyEmailPlaceholder(user.email)
  ) {
    try {
      const token = await createPasswordResetToken(user);
      const requestedNext = formData.get("next");
      const nextPath =
        typeof requestedNext === "string" &&
        requestedNext.startsWith("/") &&
        !requestedNext.startsWith("//")
          ? requestedNext
          : undefined;
      const resetUrl = await passwordResetLink(token, nextPath);
      const delivery = await sendPasswordResetEmail(user.email, resetUrl);
      if (!delivery.sent) {
        console.error("Passwort-Reset-Mail", user.email, delivery.message);
      }
    } catch (error) {
      console.error("Passwort-Reset", error);
    }
  }

  return { sent: true, email };
}

export async function resetPasswordAction(
  _prev: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  const { t } = await getServerI18n();
  const parsed = setPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "passwordConfirm") {
      return { error: t("auth.passwordMismatch") };
    }
    if (field === "password") {
      return { error: t("auth.passwordTooShort") };
    }
    return { error: t("auth.resetLinkInvalidBody") };
  }

  const lookup = await lookupPasswordResetToken(parsed.data.token);
  if (lookup.status === "expired") {
    return {
      error: t("auth.resetLinkExpiredBody", { hours: PASSWORD_RESET_HOURS }),
    };
  }
  if (lookup.status === "used") {
    return { error: t("auth.resetLinkUsedBody") };
  }
  if (lookup.status !== "ok") {
    return { error: t("auth.resetLinkInvalidBody") };
  }

  const passwordHash = await hash(parsed.data.password, 10);
  const updated = await prisma.user.update({
    where: { id: lookup.user.id },
    data: {
      passwordHash,
      emailVerifiedAt: lookup.user.emailVerifiedAt ?? new Date(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
    },
  });

  await setSessionCookie({
    id: updated.id,
    username: updated.username,
    name: updated.name,
    email: updated.email,
    role: updated.role,
  });
  await recordLastLogin(updated.id);

  redirect(await resolvePostAuthPath(updated.id, formData.get("next")));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}
