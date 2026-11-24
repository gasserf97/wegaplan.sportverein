import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HostingMetricCards } from "@/components/hosting-metrics";
import { SendRegistrationBackupButton } from "@/components/send-registration-backup-button";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getClubUsage } from "@/lib/hosting-health";
import { getServerI18n } from "@/lib/i18n";
import { canAccessStaffAdmin } from "@/lib/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("admin.hostingUsageTitle") };
}

export default async function AdminHostingPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/admin/hosting");
  if (!(await canAccessStaffAdmin(user))) redirect("/admin");

  const report = await getClubUsage();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl text-primary">{t("admin.hostingUsageTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {t("admin.hostingUsageDesc")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("admin.hostingCheckedAt", {
          time: formatDateTime(new Date(report.checkedAt)),
        })}
      </p>

      <HostingMetricCards report={report} t={t} />

      <section className="mt-8 rounded-xl border border-border bg-card px-4 py-4">
        <h2 className="text-base font-semibold">
          {t("admin.registrationBackupTitle")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("admin.registrationBackupHint")}
        </p>
        <div className="mt-4">
          <SendRegistrationBackupButton />
        </div>
      </section>

      <Link href="/admin" className="mt-8 inline-block text-sm underline">
        {t("common.back")}
      </Link>
    </div>
  );
}
