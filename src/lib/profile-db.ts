import { prisma } from "@/lib/prisma";
import {
  isFamilyEmailPlaceholder,
  isPendingTaxId,
  isProfileComplete,
  PROFILE_INCOMPLETE_NAME,
} from "@/lib/profile";

export async function assertProfilesReadyForBooking(
  actorId: string,
  memberIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const ids = [...new Set([actorId, ...memberIds])];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      phone: true,
      taxId: true,
      street: true,
      postalCode: true,
      city: true,
      birthDate: true,
      email: true,
      canLogin: true,
    },
  });

  for (const id of ids) {
    const user = users.find((item) => item.id === id);
    if (!user) {
      return { error: "Familienmitglied nicht gefunden." };
    }
    if (!isProfileComplete(user)) {
      const label =
        user.name.trim() === PROFILE_INCOMPLETE_NAME || !user.name.trim()
          ? "Ihnen bzw. einem Familienmitglied"
          : user.name;
      return {
        error: `Bitte zuerst die Stammdaten für ${label} unter „Familie“ vollständig ausfüllen.`,
      };
    }
  }
  return { ok: true };
}

export async function findProfileConflict(input: {
  email: string;
  taxId: string;
  excludeUserId?: string;
}) {
  const skipEmail =
    !input.email.trim() || isFamilyEmailPlaceholder(input.email);
  const skipTax = !input.taxId.trim() || isPendingTaxId(input.taxId);
  const [existingEmail, existingTax] = await Promise.all([
    skipEmail
      ? Promise.resolve(null)
      : prisma.user.findUnique({ where: { email: input.email } }),
    skipTax
      ? Promise.resolve(null)
      : prisma.user.findFirst({ where: { taxId: input.taxId } }),
  ]);
  if (existingEmail && existingEmail.id !== input.excludeUserId) {
    return "Diese E-Mail-Adresse ist bereits registriert.";
  }
  if (existingTax && existingTax.id !== input.excludeUserId) {
    return "Diese Steuernummer ist bereits hinterlegt.";
  }
  return null;
}
