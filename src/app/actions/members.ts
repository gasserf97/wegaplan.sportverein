"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { issueAccountInvite } from "@/lib/email-verification";
import { formChecked, formText } from "@/lib/form-draft";
import {
  familyEmailPlaceholder,
  joinPersonName,
  optionalEmailSchema,
  parseRequiredProfile,
  personNameFromFormData,
  splitPersonName,
} from "@/lib/profile";
import { findProfileConflict } from "@/lib/profile-db";
import {
  allocateUniqueUsername,
  usernameCandidateFromEmail,
} from "@/lib/username";
import { prisma } from "@/lib/prisma";
import { listAllStripeSecretKeys } from "@/lib/section-payments";
import {
  isStripeSubscriptionGone,
  syncStripeRecurringToLocalAutoRenew,
} from "@/lib/stripe-subscription-cancel";

export type ActionState = { error: string } | { ok: true } | null;

export type MemberDraftFields = {
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
  noPlatformAccess: boolean;
  useAccountAddress: boolean;
};

export type MemberFormState =
  | { error: string; fields?: MemberDraftFields }
  | { ok: true }
  | null;

const updateMemberSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, { error: "Bitte den Vornamen angeben." })
    .max(40),
  lastName: z
    .string()
    .trim()
    .min(1, { error: "Bitte den Nachnamen angeben." })
    .max(40),
  email: optionalEmailSchema,
  phone: z.string(),
  taxId: z.string().min(1, { error: "Bitte die Steuernummer angeben." }),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  birthDate: z.string().min(1, { error: "Bitte das Geburtsdatum angeben." }),
  noPlatformAccess: z.boolean(),
  useAccountAddress: z.boolean(),
  password: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .pipe(z.union([z.literal(""), z.string().min(8, { error: "Mindestens 8 Zeichen." })])),
});

function memberDraftFromForm(formData: FormData): MemberDraftFields {
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
    noPlatformAccess: formChecked(formData, "noPlatformAccess"),
    useAccountAddress: formChecked(formData, "useAccountAddress"),
  };
}

function memberError(error: string, formData: FormData): MemberFormState {
  return { error, fields: memberDraftFromForm(formData) };
}

export async function setGlobalAdminAction(
  userId: string,
  isAdmin: boolean,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };
  if (admin.id === userId && !isAdmin) {
    return { error: "Sie können sich nicht selbst die Admin-Rechte entziehen." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: isAdmin ? "ADMIN" : "USER" },
  });

  revalidatePath("/admin/mitglieder");
  return { ok: true };
}

export async function setCanBookDevicesAction(
  userId: string,
  allow: boolean,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  await prisma.user.update({
    where: { id: userId },
    data: { canBookDevices: allow },
  });

  revalidatePath("/admin/mitglieder");
  revalidatePath("/autos");
  return { ok: true };
}

export async function setSectionAdminsAction(
  userId: string,
  sectionIds: string[],
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const uniqueIds = [...new Set(sectionIds.map((id) => id.trim()).filter(Boolean))];
  const validSections = await prisma.section.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  const validIds = new Set(validSections.map((section) => section.id));

  await prisma.$transaction(async (tx) => {
    await tx.sectionAdmin.deleteMany({
      where: {
        userId,
        ...(validIds.size > 0
          ? { sectionId: { notIn: [...validIds] } }
          : {}),
      },
    });

    for (const sectionId of validIds) {
      await tx.sectionAdmin.upsert({
        where: { userId_sectionId: { userId, sectionId } },
        create: { userId, sectionId },
        update: {},
      });
    }
  });

  revalidatePath("/admin/mitglieder");
  return { ok: true };
}

export async function toggleUserSectionAction(
  userId: string,
  sectionId: string,
  assign: boolean,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  if (assign) {
    await prisma.userSection.upsert({
      where: { userId_sectionId: { userId, sectionId } },
      create: { userId, sectionId },
      update: {},
    });
  } else {
    await prisma.userSection.deleteMany({ where: { userId, sectionId } });
    await prisma.sectionAdmin.deleteMany({ where: { userId, sectionId } });
  }

  revalidatePath("/admin/mitglieder");
  return { ok: true };
}

export async function toggleSectionAdminAction(
  userId: string,
  sectionId: string,
  assign: boolean,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  if (assign) {
    await prisma.sectionAdmin.upsert({
      where: { userId_sectionId: { userId, sectionId } },
      create: { userId, sectionId },
      update: {},
    });
  } else {
    await prisma.sectionAdmin.deleteMany({ where: { userId, sectionId } });
  }

  revalidatePath("/admin/mitglieder");
  return { ok: true };
}

async function cancelStripeRecurringForUser(userId: string) {
  if ((await listAllStripeSecretKeys()).length === 0) return;

  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      OR: [
        { stripeSubscriptionId: { not: null } },
        { stripeSessionId: { not: null } },
      ],
    },
    select: {
      id: true,
      periodEnd: true,
      stripeSubscriptionId: true,
      stripeSessionId: true,
    },
  });

  for (const subscription of subscriptions) {
    try {
      await syncStripeRecurringToLocalAutoRenew({
        ...subscription,
        autoRenew: false,
      });
    } catch (error) {
      if (!isStripeSubscriptionGone(error)) throw error;
    }
  }
}

export async function deleteUserAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };
  if (admin.id === userId) {
    return { error: "Sie können Ihr eigenes Konto nicht löschen." };
  }

  const [user, pendingRefundCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        _count: { select: { dependents: true } },
      },
    }),
    prisma.pendingRefundTransfer.count({
      where: { userId, status: "PENDING" },
    }),
  ]);
  if (!user) return { error: "Mitglied nicht gefunden." };

  if (user._count.dependents > 0) {
    return {
      error:
        "Dieses Konto hat noch Familienmitglieder. Bitte zuerst die Angehörigen löschen.",
    };
  }

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { error: "Der letzte Haupt-Admin kann nicht gelöscht werden." };
    }
  }

  if (pendingRefundCount > 0) {
    return {
      error:
        "Es gibt noch offene Rücküberweisungen für diese Person. Bitte zuerst in der Buchhaltung abschließen.",
    };
  }

  try {
    await cancelStripeRecurringForUser(userId);
  } catch (error) {
    console.error("Stripe beim Benutzerlöschen", userId, error);
    return {
      error:
        "Laufende Kartenzahlungen konnten bei Stripe nicht beendet werden. Bitte später erneut versuchen.",
    };
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/mitglieder");
  revalidatePath("/konto", "layout");
  return { ok: true };
}

export async function updateMemberAction(
  userId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const admin = await requireAdmin();
  if (!admin) return memberError("Nur Haupt-Administratoren.", formData);

  const parsed = updateMemberSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    taxId: formData.get("taxId"),
    street: formData.get("street") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    city: formData.get("city") ?? "",
    birthDate: formData.get("birthDate"),
    noPlatformAccess: formChecked(formData, "noPlatformAccess"),
    useAccountAddress: formChecked(formData, "useAccountAddress"),
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return memberError(
      parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
      formData,
    );
  }

  const fullName = joinPersonName(parsed.data.firstName, parsed.data.lastName);

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      canLogin: true,
    },
  });
  if (!current) return memberError("Mitglied nicht gefunden.", formData);

  if (
    parsed.data.noPlatformAccess &&
    (admin.id === current.id || current.role === "ADMIN")
  ) {
    return memberError(
      "Haupt-Administratoren müssen einen Plattformzugang behalten.",
      formData,
    );
  }

  const grantingAccess =
    current.canLogin === false && !parsed.data.noPlatformAccess;

  const email =
    parsed.data.noPlatformAccess && !parsed.data.email
      ? familyEmailPlaceholder(current.username)
      : parsed.data.email;
  if (!parsed.data.noPlatformAccess && !email) {
    return memberError(
      "Für den Plattformzugang bitte eine E-Mail-Adresse angeben.",
      formData,
    );
  }

  let street = parsed.data.street;
  let postalCode = parsed.data.postalCode;
  let city = parsed.data.city;
  if (parsed.data.useAccountAddress) {
    const account = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { street: true, postalCode: true, city: true },
    });
    if (
      !account?.street.trim() ||
      !account.postalCode.trim() ||
      !account.city.trim()
    ) {
      return memberError(
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
      ...parsed.data,
      street,
      postalCode,
      city,
    },
    { phoneOptional: parsed.data.noPlatformAccess },
  );
  if (!profile.ok) return memberError(profile.error, formData);

  const conflict = await findProfileConflict({
    email,
    taxId: profile.taxId,
    excludeUserId: userId,
  });
  if (conflict) return memberError(conflict, formData);

  const username = grantingAccess
    ? await allocateUniqueUsername(usernameCandidateFromEmail(email))
    : null;

  await prisma.user.update({
    where: { id: userId },
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
      canLogin: !parsed.data.noPlatformAccess,
      emailVerifiedAt: grantingAccess ? null : new Date(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
      ...(!grantingAccess && !parsed.data.noPlatformAccess && parsed.data.password
        ? {
            passwordHash: await hash(parsed.data.password, 10),
            failedLoginCount: 0,
            loginLockedUntil: null,
          }
        : {}),
    },
  });

  if (grantingAccess) {
    const invite = await issueAccountInvite(userId, "/konto/familie");
    if (!invite.sent) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          canLogin: false,
          emailVerifiedAt: new Date(),
          emailVerifyToken: null,
          emailVerifyExpiresAt: null,
        },
      });
      revalidatePath("/admin/mitglieder");
      revalidatePath("/konto", "layout");
      revalidatePath("/konto/familie");
      return memberError(
        invite.error ??
          "Einladungs-E-Mail konnte nicht gesendet werden. Der Zugang wurde nicht aktiviert. Bitte erneut speichern.",
        formData,
      );
    }
  }

  revalidatePath("/admin/mitglieder");
  revalidatePath("/konto", "layout");
  revalidatePath("/konto/familie");
  return { ok: true };
}
