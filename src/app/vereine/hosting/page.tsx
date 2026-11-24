import { redirect } from "next/navigation";
import {
  HostingMetricCards,
  HostingOverall,
} from "@/components/hosting-metrics";
import { formatDateTime } from "@/lib/format";
import { getPlatformHostingHealth } from "@/lib/hosting-health";
import { getServerI18n } from "@/lib/i18n";
import { getPlatformAdmin } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";

export default async function PlatformHostingPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");
  const { t } = await getServerI18n();
  const report = await getPlatformHostingHealth();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        Betreiber
      </p>
      <h1 className="mt-2 text-4xl">{t("admin.hostingTitle")}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {t("admin.hostingDesc")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("admin.hostingCheckedAt", {
          time: formatDateTime(new Date(report.checkedAt)),
        })}
      </p>

      <HostingOverall report={report} t={t} />

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

      <HostingMetricCards report={report} t={t} />

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
    </main>
  );
}
