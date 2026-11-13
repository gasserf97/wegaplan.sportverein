import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n";
import {
  canAccessCourseAdmin,
  canAccessStaffAdmin,
  canAccessTennisReporting,
  canViewMembersAdmin,
} from "@/lib/permissions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const { t } = await getServerI18n();

  if (!user) {
    redirect("/anmelden?next=/admin");
  }

  const [courseAdmin, staffAdmin, membersView, tennisReporting] =
    await Promise.all([
      canAccessCourseAdmin(user),
      canAccessStaffAdmin(user),
      canViewMembersAdmin(user),
      canAccessTennisReporting(user),
    ]);

  if (!courseAdmin && !staffAdmin) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-20 sm:px-6">
        <h1 className="text-4xl">{t("admin.accessDeniedTitle")}</h1>
        <p className="mt-3 text-muted-foreground">
          {t("admin.accessDeniedMsg")}
        </p>
        <Link href="/" className="mt-6 inline-block underline">
          {t("admin.accessDeniedLink")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <nav className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-30 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 py-3 sm:px-6">
          {courseAdmin ? (
            <>
              <AdminNavLink href="/admin">{t("nav.adminCourses")}</AdminNavLink>
              <AdminNavLink href="/admin/abos">
                {t("nav.adminSubscriptions")}
              </AdminNavLink>
              <AdminNavLink href="/admin/buchhaltung">
                {t("nav.adminAccounting")}
              </AdminNavLink>
            </>
          ) : null}
          {membersView ? (
            <AdminNavLink href="/admin/mitglieder">
              {t("nav.adminMembers")}
            </AdminNavLink>
          ) : null}
          {staffAdmin ? (
            <>
              <AdminNavLink href="/admin/events">
                {t("nav.adminEvents")}
              </AdminNavLink>
              <AdminNavLink href="/admin/tickets">
                {t("nav.adminTickets")}
              </AdminNavLink>
              <AdminNavLink href="/admin/sektionen">
                {t("nav.adminSections")}
              </AdminNavLink>
              <AdminNavLink href="/admin/tennisplaetze">
                {t("nav.adminCourts")}
              </AdminNavLink>
            </>
          ) : null}
          {tennisReporting ? (
            <AdminNavLink href="/admin/tennisplaetze/reporting">
              Tennis-Reporting
            </AdminNavLink>
          ) : null}
          {staffAdmin ? (
            <>
              <AdminNavLink href="/admin/geraete">
                {t("nav.adminFleet")}
              </AdminNavLink>
              <AdminNavLink href="/admin/hosting">
                {t("nav.adminHosting")}
              </AdminNavLink>
            </>
          ) : null}
        </div>
      </nav>
      {children}
    </div>
  );
}

function AdminNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-primary"
    >
      {children}
    </Link>
  );
}
