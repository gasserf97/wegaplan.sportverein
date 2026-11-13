import { prisma } from "@/lib/prisma";
import { ageFromBirthDate } from "@/lib/pricing";
import { hasActiveClubMembership } from "@/lib/membership";
import { displayUserEmail, displayUserName, displayUserTaxId } from "@/lib/profile";

export type FamilyPerson = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  emailVerified: boolean;
  birthDate: Date;
  age: number;
  isSelf: boolean;
  hasMembership: boolean;
  canLogin: boolean;
};

const familySelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  phone: true,
  taxId: true,
  street: true,
  postalCode: true,
  city: true,
  emailVerifiedAt: true,
  birthDate: true,
  canLogin: true,
  managedById: true,
  createdAt: true,
} as const;

/** Haushalts-Root: managedById ?? eigene id. */
export async function householdRootId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, managedById: true },
  });
  if (!user) return null;
  return user.managedById ?? user.id;
}

export async function canManageFamilyMembers(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { birthDate: true, canLogin: true, role: true },
  });
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (!actor.canLogin) return false;
  return ageFromBirthDate(actor.birthDate) >= 18;
}

export async function canActFor(actorId: string, targetId: string) {
  if (actorId === targetId) return true;

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, managedById: true, birthDate: true, canLogin: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, managedById: true },
    }),
  ]);
  if (!actor || !target) return false;
  if (actor.role === "ADMIN") return true;
  if (!actor.canLogin) return false;

  const actorHouse = actor.managedById ?? actor.id;
  const targetHouse = target.managedById ?? target.id;
  if (actorHouse !== targetHouse) return false;

  // Unter 18: nur für sich selbst (bereits oben true).
  if (ageFromBirthDate(actor.birthDate) < 18) return false;
  return true;
}

/** Alter aller Personen im Haushalt, ohne Mitgliedschafts-Lookups. */
export async function listHouseholdAges(actorId: string): Promise<number[]> {
  const self = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, managedById: true },
  });
  if (!self) return [];

  const rootId = self.managedById ?? self.id;
  const members = await prisma.user.findMany({
    where: { OR: [{ id: rootId }, { managedById: rootId }] },
    select: { birthDate: true },
  });
  return members.map((person) => ageFromBirthDate(person.birthDate));
}

export async function listFamily(actorId: string): Promise<FamilyPerson[]> {
  const self = await prisma.user.findUnique({
    where: { id: actorId },
    select: familySelect,
  });
  if (!self) return [];

  const rootId = self.managedById ?? self.id;
  const members = await prisma.user.findMany({
    where: {
      OR: [{ id: rootId }, { managedById: rootId }],
    },
    select: familySelect,
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
    members.map(async (person) => ({
      id: person.id,
      name: displayUserName(person.name),
      username: person.username,
      email: displayUserEmail(person.email),
      phone: person.phone,
      taxId: displayUserTaxId(person.taxId),
      street: person.street,
      postalCode: person.postalCode,
      city: person.city,
      emailVerified: Boolean(person.emailVerifiedAt),
      birthDate: person.birthDate,
      age: ageFromBirthDate(person.birthDate),
      isSelf: person.id === actorId,
      hasMembership: await hasActiveClubMembership(person.id),
      canLogin: person.canLogin,
    })),
  );
}
