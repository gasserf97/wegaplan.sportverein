"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { issueAccountInvite } from "@/lib/email-verification";
import {
  canActFor,
  canManageFamilyMembers,
  householdRootId,
} from "@/lib/family";
import { formChecked, formText } from "@/lib/form-draft";
import {
  emailSchema,
  familyEmailPlaceholder,
  isFamilyEmailPlaceholder,
  joinPersonName,
  optionalEmailSchema,
  parseRequiredProfile,
  personNameFromFormData,
  PROFILE_INCOMPLETE_NAME,
  splitPersonName,
} from "@/lib/profile";
import { findProfileConflict } from "@/lib/profile-db";
import {
  allocateUniqueUsername,
  usernameCandidateFromEmail,
} from "@/lib/username";
import { prisma } from "@/lib/prisma";

export type FamilyDraftFields = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  birthDate: string;
  useAccountAddress?: boolean;
  noPlatformAccess?: boolean;
};

export type FamilyFormState =
  | { error: string; fields?: FamilyDraftFields }
  | { ok: true; inviteSent?: boolean }
  | null;

const firstNameField = z
  .string()
  .trim()
  .min(1, { error: "Bitte den Vornamen angeben." })
  .max(40);
const lastNameField = z
  .string()
  .trim()
  .min(1, { error: "Bitte den Nachnamen angeben." })
  .max(40);

const dependentBaseSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  email: optionalEmailSchema,
  phone: z.string(),
  taxId: z.string().min(1, { error: "Bitte die Steuernummer angeben." }),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  birthDate: z.string().min(1, { error: "Bitte das Geburtsdatum angeben." }),
  useAccountAddress: z.boolean(),
  noPlatformAccess: z.boolean(),
});

const selfMemberUpdateSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  email: emailSchema,
  phone: z.string(),
  taxId: z.string().min(1, { error: "Bitte die Steuernummer angeben." }),
  street: z.string().min(1, { error: "Bitte Straße und Hausnummer angeben." }),
  postalCode: z.string().min(1, { error: "Bitte die Postleitzahl angeben." }),
  city: z.string().min(1, { error: "Bitte den Wohnort angeben." }),
  birthDate: z.string().min(1, { error: "Bitte das Geburtsdatum angeben." }),
});

const dependentMemberUpdateSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  email: optionalEmailSchema,
  phone: z.string(),
  taxId: z.string().min(1, { error: "Bitte die Steuernummer angeben." }),
  street: z.string().min(1, { error: "Bitte Straße und Hausnummer angeben." }),
  postalCode: z.string().min(1, { error: "Bitte die Postleitzahl angeben." }),
  city: z.string().min(1, { error: "Bitte den Wohnort angeben." }),
  birthDate: z.string().min(1, { error: "Bitte das Geburtsdatum angeben." }),
});

function familyDraftFromForm(formData: FormData): FamilyDraftFields {
  const name = personNameFromFormData(formData);
  const parts = splitPersonName(name);
  return {
    name,
    firstName: formText(formData, "firstName") || parts.firstName,
    lastName: formText(formData, "lastName") || parts.lastName,
    email: formText(formData, "email"),
    phone: formText(formData, "phone"),
    taxId: formText(formData, "taxId"),
    street: formText(formData, "street"),
    postalCode: formText(formData, "postalCode"),
    city: formText(formData, "city"),
    birthDate: formText(formData, "birthDate"),
    useAccountAddress: formChecked(formData, "useAccountAddress"),
    noPlatformAccess: formChecked(formData, "noPlatformAccess"),
  };
}

function familyError(error: string, formData: FormData): FamilyFormState {
  return { error, fields: familyDraftFromForm(formData) };
}

function revalidateFamily() {
  revalidatePath("/konto");
  revalidatePath("/konto/familie");
  revalidatePath("/admin/mitglieder");
  revalidatePath("/abos");
  revalidatePath("/kurse");
  revalidatePath("/", "layout");
}

function generatedNoLoginUsername() {
  return `nl-${randomBytes(10).toString("hex")}`;
}

/** Leer = Passwort bleibt. Sonst neues Passwort und Wiederholung. */
async function passwordChangeFromForm(
  formData: FormData,
  options: { allowed: boolean },
): Promise<{ passwordHash: string } | { error: string } | Record<string, never>> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  if (!password && !passwordConfirm) return {};
  if (!options.allowed) {
    return { error: "Das Passwort kann hier nicht geändert werden." };
  }
  if (password.length < 8) {
    return { error: "Mindestens 8 Zeichen." };
  }
  if (password !== passwordConfirm) {
    return { error: "Die Passwörter stimmen nicht überein." };
  }
  return { passwordHash: await hash(password, 10) };
}

export async function addFamilyMemberAction(
  _prev: FamilyFormState,
  formData: FormData,
): Promise<FamilyFormState> {
  const actor = await getCurrentUser();
  if (!actor) return familyError("Bitte anmelden.", formData);

  if (!(await canManageFamilyMembers(actor.id))) {
    return familyError(
      "Nur volljährige Familienmitglieder mit Zugang können Personen anlegen.",
      formData,
    );
  }

  const rootId = await householdRootId(actor.id);
  if (!rootId) return familyError("Familie nicht gefunden.", formData);

  const count = await prisma.user.count({
    where: { managedById: rootId },
  });
  if (count >= 12) {
    return familyError("Höchstens 12 Familienmitglieder.", formData);
  }

  const useAccountAddress = formChecked(formData, "useAccountAddress");
  const noPlatformAccess = formChecked(formData, "noPlatformAccess");

  const parsed = dependentBaseSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    taxId: formData.get("taxId"),
    street: formData.get("street") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    city: formData.get("city") ?? "",
    birthDate: formData.get("birthDate"),
    useAccountAddress,
    noPlatformAccess,
  });
  if (!parsed.success) {
    return familyError(
      parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
      formData,
    );
  }

  const fullName = joinPersonName(parsed.data.firstName, parsed.data.lastName);
  if (fullName === PROFILE_INCOMPLETE_NAME) {
    return familyError("Bitte einen echten Namen angeben.", formData);
  }

  if (!noPlatformAccess && !parsed.data.email.trim()) {
    return familyError(
      "Für den Plattformzugang bitte eine E-Mail-Adresse angeben.",
      formData,
    );
  }

  let street = parsed.data.street;
  let postalCode = parsed.data.postalCode;
  let city = parsed.data.city;
  if (useAccountAddress) {
    const account = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { street: true, postalCode: true, city: true },
    });
    if (
      !account?.street?.trim() ||
      !account.postalCode?.trim() ||
      !account.city?.trim()
    ) {
      return familyError(
        "In Ihrem Konto ist noch keine vollständige Adresse hinterlegt.",
        formData,
      );
    }
    street = account.street;
    postalCode = account.postalCode;
    city = account.city;
  }

  const profile = parseRequiredProfile(
    {
      phone: parsed.data.phone,
      taxId: parsed.data.taxId,
      birthDate: parsed.data.birthDate,
      street,
      postalCode,
      city,
    },
    { phoneOptional: noPlatformAccess },
  );
  if (!profile.ok) return familyError(profile.error, formData);

  let username: string;
  let passwordHash: string;
  let canLogin = true;
  let inviteSent = false;

  if (noPlatformAccess) {
    username = generatedNoLoginUsername();
    while (await prisma.user.findUnique({ where: { username } })) {
      username = generatedNoLoginUsername();
    }
    passwordHash = await hash(randomBytes(32).toString("hex"), 10);
    canLogin = false;
  } else {
    username = await allocateUniqueUsername(
      usernameCandidateFromEmail(parsed.data.email),
    );
    passwordHash = await hash(randomBytes(32).toString("hex"), 10);
  }

  const email =
    parsed.data.email.trim() || familyEmailPlaceholder(username);

  const conflict = await findProfileConflict({
    email,
    taxId: profile.taxId,
  });
  if (conflict) return familyError(conflict, formData);

  const created = await prisma.user.create({
    data: {
      username,
      name: fullName,
      email,
      phone: profile.phone,
      taxId: profile.taxId,
      street: profile.street,
      postalCode: profile.postalCode,
      city: profile.city,
      birthDate: profile.birthDate,
      passwordHash,
      canLogin,
      managedById: rootId,
      emailVerifiedAt: canLogin ? null : new Date(),
    },
  });

  if (canLogin) {
    const invite = await issueAccountInvite(created.id, "/konto/familie");
    inviteSent = invite.sent;
    if (!invite.sent) {
      revalidateFamily();
      redirect(
        "/konto/familie?added=invite-failed#family-members-list",
      );
    }
  }

  revalidateFamily();
  redirect(
    `/konto/familie?added=${inviteSent ? "invited" : "saved"}#family-members-list`,
  );
}

export async function updateFamilyMemberAction(
  memberId: string,
  _prev: FamilyFormState,
  formData: FormData,
): Promise<FamilyFormState> {
  const actor = await getCurrentUser();
  if (!actor) return familyError("Bitte anmelden.", formData);
  if (!(await canActFor(actor.id, memberId))) {
    return familyError("Sie dürfen diese Person nicht bearbeiten.", formData);
  }

  const current = await prisma.user.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      username: true,
      managedById: true,
      canLogin: true,
      email: true,
      emailVerifiedAt: true,
    },
  });
  if (!current) return familyError("Familienmitglied nicht gefunden.", formData);

  const isSelf = memberId === actor.id;
  const noPlatformAccess = isSelf
    ? false
    : formChecked(formData, "noPlatformAccess");
  const wantsAccess = isSelf || !noPlatformAccess;
  const schema = wantsAccess
    ? selfMemberUpdateSchema
    : dependentMemberUpdateSchema;
  const parsed = schema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    taxId: formData.get("taxId"),
    street: formData.get("street"),
    postalCode: formData.get("postalCode"),
    city: formData.get("city"),
    birthDate: formData.get("birthDate"),
  });
  if (!parsed.success) {
    return familyError(
      parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
      formData,
    );
  }

  const fullName = joinPersonName(parsed.data.firstName, parsed.data.lastName);
  if (fullName === PROFILE_INCOMPLETE_NAME) {
    return familyError("Bitte einen echten Namen angeben.", formData);
  }

  if (wantsAccess && !parsed.data.email.trim()) {
    return familyError(
      "Für den Plattformzugang bitte eine E-Mail-Adresse angeben.",
      formData,
    );
  }

  const profile = parseRequiredProfile(parsed.data, {
    phoneOptional: !wantsAccess,
  });
  if (!profile.ok) return familyError(profile.error, formData);

  const email = wantsAccess
    ? parsed.data.email
    : parsed.data.email.trim() || familyEmailPlaceholder(current.username);

  const conflict = await findProfileConflict({
    email,
    taxId: profile.taxId,
    excludeUserId: memberId,
  });
  if (conflict) return familyError(conflict, formData);

  const emailChanged =
    email.trim().toLowerCase() !== current.email.trim().toLowerCase() &&
    !isFamilyEmailPlaceholder(email);
  const grantingAccess = !isSelf && wantsAccess && !current.canLogin;

  const passwordChange = await passwordChangeFromForm(formData, {
    allowed: isSelf && current.canLogin,
  });
  if ("error" in passwordChange) return familyError(passwordChange.error, formData);

  const username = grantingAccess
    ? await allocateUniqueUsername(usernameCandidateFromEmail(email))
    : null;

  await prisma.user.update({
    where: { id: memberId },
    data: {
      name: fullName,
      email,
      phone: profile.phone,
      taxId: profile.taxId,
      street: profile.street,
      postalCode: profile.postalCode,
      city: profile.city,
      birthDate: profile.birthDate,
      ...(username ? { username } : {}),
      ...(!isSelf ? { canLogin: wantsAccess } : {}),
      ...(grantingAccess
        ? {
            emailVerifiedAt: null,
            emailVerifyToken: null,
            emailVerifyExpiresAt: null,
          }
        : !wantsAccess
          ? {
              emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
              emailVerifyToken: null,
              emailVerifyExpiresAt: null,
            }
          : emailChanged
            ? {
                emailVerifiedAt: null,
                emailVerifyToken: null,
                emailVerifyExpiresAt: null,
              }
            : {}),
      ...("passwordHash" in passwordChange
        ? {
            passwordHash: passwordChange.passwordHash,
            failedLoginCount: 0,
            loginLockedUntil: null,
          }
        : {}),
    },
  });

  if (grantingAccess) {
    const invite = await issueAccountInvite(memberId, "/konto/familie");
    if (!invite.sent) {
      await prisma.user.update({
        where: { id: memberId },
        data: {
          canLogin: false,
          emailVerifiedAt: new Date(),
          emailVerifyToken: null,
          emailVerifyExpiresAt: null,
        },
      });
      revalidateFamily();
      return familyError(
        invite.error ??
          "Einladungs-E-Mail konnte nicht gesendet werden. Der Zugang wurde nicht aktiviert. Bitte erneut speichern.",
        formData,
      );
    }
    revalidateFamily();
    return { ok: true, inviteSent: true };
  }

  revalidateFamily();
  return { ok: true, inviteSent: false };
}

export async function removeFamilyMemberAction(
  memberId: string,
): Promise<{ error: string } | null> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Bitte anmelden." };
  if (memberId === actor.id) {
    return { error: "Das eigene Konto kann hier nicht gelöscht werden." };
  }
  if (!(await canManageFamilyMembers(actor.id))) {
    return {
      error:
        "Nur volljährige Familienmitglieder mit Zugang können Personen entfernen.",
    };
  }

  const rootId = await householdRootId(actor.id);
  if (!rootId) return { error: "Familie nicht gefunden." };

  const member = await prisma.user.findUnique({
    where: { id: memberId },
    include: {
      _count: {
        select: {
          subscriptions: { where: { status: "ACTIVE" } },
          enrollments: { where: { status: "PAID" } },
        },
      },
    },
  });

  const memberHouse = member?.managedById ?? member?.id;
  if (!member || memberHouse !== rootId || member.id === rootId) {
    // Root nicht löschen; nur Dependents
    if (member?.id === rootId) {
      return { error: "Das erste Familienkonto kann hier nicht entfernt werden." };
    }
    return { error: "Familienmitglied nicht gefunden." };
  }

  if (member.managedById !== rootId) {
    return { error: "Familienmitglied nicht gefunden." };
  }

  if (member._count.subscriptions > 0 || member._count.enrollments > 0) {
    return {
      error:
        "Dieses Mitglied hat noch aktive Mitgliedschaften oder bezahlte Kurse und kann nicht entfernt werden.",
    };
  }

  await prisma.user.delete({ where: { id: memberId } });
  revalidateFamily();
  return null;
}
