import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  StaffManagement,
  type StaffMember,
} from "@/components/staff-management";
import { requireCourseManager } from "@/lib/auth";
import { toDateInputValue } from "@/lib/format";
import { canAccessStaffAdmin } from "@/lib/permissions";
import {
  displayUserEmail,
  displayUserName,
  displayUserTaxId,
} from "@/lib/profile";
import { parseClientChannel } from "@/lib/client-channel";
import { prisma } from "@/lib/prisma";
import { sectionListOrderBy } from "@/lib/section-order";
import { currentlyValidSubscriptionFilter } from "@/lib/subscriptions";

export const metadata: Metadata = { title: "Mitgliederverwaltung" };

function compareMembersByName(a: StaffMember, b: StaffMember) {
  const aName = a.name.trim();
  const bName = b.name.trim();
  if (!aName && bName) return 1;
  if (aName && !bName) return -1;
  const byName = aName.localeCompare(bName, "de", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.username.localeCompare(b.username, "de", { sensitivity: "base" });
}

export default async function MembersAdminPage() {
  const manager = await requireCourseManager();
  if (!manager) redirect("/admin");
  const canEdit = await canAccessStaffAdmin(manager);

  const now = new Date();
  const [users, sections] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        sectionAdminOf: { select: { sectionId: true } },
        _count: { select: { dependents: true } },
        subscriptions: {
          where: currentlyValidSubscriptionFilter(now),
          select: {
            plan: {
              select: {
                kind: true,
                section: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.section.findMany({ orderBy: sectionListOrderBy }),
  ]);

  const members: StaffMember[] = users.map((user) => ({
    id: user.id,
    username: user.username,
    name: displayUserName(user.name),
    email: displayUserEmail(user.email),
    phone: user.phone,
    taxId: displayUserTaxId(user.taxId),
    street: user.street,
    postalCode: user.postalCode,
    city: user.city,
    emailVerified: Boolean(user.emailVerifiedAt),
    birthDate: user.birthDate.toISOString(),
    birthDateInput: toDateInputValue(user.birthDate),
    createdAt: user.createdAt.toISOString(),
    role: user.role,
    canLogin: user.canLogin,
    sectionAdminIds: user.sectionAdminOf.map((s) => s.sectionId),
    hasClubMembership: user.subscriptions.some(
      (item) => item.plan.kind === "MEMBERSHIP",
    ),
    hasTennisMembership: user.subscriptions.some(
      (item) =>
        item.plan.kind === "ADDON" && item.plan.section?.name === "Tennis",
    ),
    canBookDevices: user.canBookDevices,
    dependentCount: user._count.dependents,
    lastClient: canEdit ? parseClientChannel(user.lastClient) : null,
  }));
  members.sort(compareMembersByName);
  const adminRecord = users.find((user) => user.id === manager.id);
  const adminAddress =
    adminRecord?.street.trim() &&
    adminRecord.postalCode.trim() &&
    adminRecord.city.trim()
      ? {
          street: adminRecord.street,
          postalCode: adminRecord.postalCode,
          city: adminRecord.city,
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl text-primary">Mitgliederverwaltung</h1>
          <p className="mt-2 text-muted-foreground">
            {canEdit
              ? "Alle registrierten Personen. Haupt-Administratoren und Sektions-Admins vergeben Sie hier. Mit „Simulieren“ sehen Sie die App aus Sicht einer Person. Sportverein- und Tennismitgliedschaft kommen aus den aktiven Mitgliedschaften."
              : "Alle registrierten Personen (nur Ansicht). Bearbeiten, Rechte vergeben und Löschen sind dem Haupt-Admin vorbehalten."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <>
              <a
                href="/api/admin/members/export"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                Excel exportieren
              </a>
              <Link
                href="/admin/sektionen"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                Sektionen verwalten
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {members.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          Noch keine Mitglieder registriert.
        </p>
      ) : (
        <>
          {canEdit ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Unter <strong>Sektionsadmin</strong> können Sie mehrere Sektionen
              auswählen. Die Person darf dann Kurse und Mitgliedschaften dieser
              Sektionen verwalten. Unter <strong>Fuhrpark</strong> vergeben Sie
              das Recht zur Fahrzeugreservierung. Löschen entfernt die Person
              unwiderruflich; bei einem Familienkonto zuerst die Angehörigen
              löschen.
            </p>
          ) : null}
          <StaffManagement
            members={members}
            sections={sections}
            currentAdminId={manager.id}
            currentAdminAddress={adminAddress}
            readOnly={!canEdit}
          />
        </>
      )}
    </div>
  );
}
