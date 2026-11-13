import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SendRegistrationBackupButton } from "@/components/send-registration-backup-button";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime, formatShortDate } from "@/lib/format";
import {
  getHostingHealth,
  type HealthLevel,
} from "@/lib/hosting-health";
import { getServerI18n } from "@/lib/i18n";
import { canAccessStaffAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("admin.hostingTitle") };
}

function levelStyles(level: HealthLevel) {
  switch (level) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-950";
    case "warn":
      return "border-amber-300 bg-amber-50 text-amber-950";
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

function levelLabel(level: HealthLevel, t: (key: string) => string) {
  switch (level) {
    case "critical":
      return t("admin.hostingLevelCritical");
    case "warn":
      return t("admin.hostingLevelWarn");
    case "ok":
      return t("admin.hostingLevelOk");
    default:
      return t("admin.hostingLevelUnknown");
  }
}

export default async function AdminHostingPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/admin/hosting");
  if (!(await canAccessStaffAdmin(user))) redirect("/admin");

  const report = await getHostingHealth();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl text-primary">{t("admin.hostingTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {t("admin.hostingDesc")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("admin.hostingCheckedAt", {
          time: formatDateTime(new Date(report.checkedAt)),
        })}
      </p>

      <div
        className={cn(
          "mt-8 rounded-xl border px-4 py-3 text-sm",
          levelStyles(report.overall),
        )}
      >
        <p className="font-semibold">
          {t("admin.hostingOverall")}: {levelLabel(report.overall, t)}
        </p>
        {report.recommendations.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">{t("admin.hostingAllOk")}</p>
        )}
      </div>

      {!report.renderConfigured ? (
        <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("admin.hostingRenderHint")}
        </p>
      ) : null}
      {report.renderError ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("admin.hostingRenderError")}: {report.renderError}
        </p>
      ) : null}

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

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {report.metrics.map((metric) => (
          <article
            key={metric.id}
            className={cn(
              "rounded-xl border px-4 py-4",
              levelStyles(metric.level),
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{metric.label}</h2>
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide">
                {levelLabel(metric.level, t)}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium">{metric.valueLabel}</p>
            {metric.detail ? (
              <p className="mt-1 text-xs opacity-80">{metric.detail}</p>
            ) : null}
            {metric.upgradeHint ? (
              <p className="mt-3 text-sm font-medium">{metric.upgradeHint}</p>
            ) : null}
            {metric.peak ? (
              <p className="mt-3 text-[0.7rem] leading-4 opacity-70">
                {t("admin.hostingPeak", {
                  value: metric.peak.valueLabel,
                  time: metric.peakDayOnly
                    ? formatShortDate(new Date(metric.peak.at))
                    : formatDateTime(new Date(metric.peak.at)),
                })}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        {t("admin.hostingRenderLinkPrefix")}{" "}
        <a
          href="https://dashboard.render.com"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          dashboard.render.com
        </a>
      </p>
      <Link href="/admin" className="mt-4 inline-block text-sm underline">
        {t("common.back")}
      </Link>
    </div>
  );
}
