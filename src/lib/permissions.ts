import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

export type UserAccess = {
  isGlobalAdmin: boolean;
  sectionAdminIds: string[];
};

export async function getUserAccess(userId: string): Promise<UserAccess> {
  const [user, sectionAdmins] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
    prisma.sectionAdmin.findMany({
      where: { userId },
      select: { sectionId: true },
    }),
  ]);

  return {
    isGlobalAdmin: user?.role === "ADMIN",
    sectionAdminIds: sectionAdmins.map((item) => item.sectionId),
  };
}

export async function getManagedSectionIds(userId: string): Promise<string[]> {
  const access = await getUserAccess(userId);
  if (access.isGlobalAdmin) {
    const sections = await prisma.section.findMany({ select: { id: true } });
    return sections.map((s) => s.id);
  }
  return access.sectionAdminIds;
}

export async function canManageSection(
  userId: string,
  sectionId: string,
): Promise<boolean> {
  const access = await getUserAccess(userId);
  if (access.isGlobalAdmin) return true;
  return access.sectionAdminIds.includes(sectionId);
}

export async function canManageCourse(
  userId: string,
  course: { sectionId: string | null; createdById: string | null },
): Promise<boolean> {
  const access = await getUserAccess(userId);
  if (access.isGlobalAdmin) return true;
  if (!course.sectionId) return false;
  return access.sectionAdminIds.includes(course.sectionId);
}

export async function canManagePlan(
  userId: string,
  plan: { sectionId: string | null; createdById: string | null },
): Promise<boolean> {
  return canManageCourse(userId, plan);
}

export async function canAccessStaffAdmin(user: SessionUser): Promise<boolean> {
  return user.role === "ADMIN";
}

export async function canAccessCourseAdmin(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const access = await getUserAccess(user.id);
  return access.sectionAdminIds.length > 0;
}

/** Mitgliederliste lesen (Sektions-Admins: nur Ansicht, keine Bearbeitung). */
export async function canViewMembersAdmin(user: SessionUser): Promise<boolean> {
  return canAccessCourseAdmin(user);
}

async function tennisSectionId(): Promise<string | null> {
  const tennis = await prisma.section.findUnique({
    where: { name: "Tennis" },
    select: { id: true },
  });
  return tennis?.id ?? null;
}

export async function isTennisSectionAdmin(userId: string): Promise<boolean> {
  const tennisId = await tennisSectionId();
  if (!tennisId) return false;
  const admin = await prisma.sectionAdmin.findUnique({
    where: { userId_sectionId: { userId, sectionId: tennisId } },
    select: { id: true },
  });
  return Boolean(admin);
}

/** Tennis-Saison-Reporting: Haupt-Admin oder Tennis-Sektions-Admin. */
export async function canAccessTennisReporting(
  user: SessionUser,
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  return isTennisSectionAdmin(user.id);
}

export async function canBookLongTennisSlots(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  return isTennisSectionAdmin(user.id);
}

/** Fuhrpark (Autos/Busse): nur mit explizitem Recht oder als Haupt-Admin. */
export async function canBookFleetDevices(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { canBookDevices: true },
  });
  return Boolean(row?.canBookDevices);
}
