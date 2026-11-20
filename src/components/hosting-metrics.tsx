import { formatDateTime, formatShortDate } from "@/lib/format";
import type { HealthLevel, HostingHealthReport } from "@/lib/hosting-health";
import type { TFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

function levelLabel(level: HealthLevel, t: TFunction) {
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

export function HostingMetricCards({
  report,
  t,
}: {
  report: HostingHealthReport;
  t: TFunction;
}) {
  return (
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
            <span className="shrink-0 text-xs font-medium tracking-wide uppercase">
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
  );
}

export function HostingOverall({
  report,
  t,
}: {
  report: HostingHealthReport;
  t: TFunction;
}) {
  return (
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
  );
}
