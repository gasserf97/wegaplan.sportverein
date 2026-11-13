import Link from "next/link";
import {
  getHostingHealth,
  hostingNeedsAttention,
} from "@/lib/hosting-health";
import { getServerI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export async function HostingHealthBanner() {
  const { t } = await getServerI18n();
  let report;
  try {
    report = await getHostingHealth();
  } catch {
    return null;
  }
  if (!hostingNeedsAttention(report)) return null;

  const critical = report.overall === "critical";
  return (
    <div
      className={cn(
        "mb-6 rounded-xl border px-4 py-3 text-sm",
        critical
          ? "border-red-300 bg-red-50 text-red-950"
          : "border-amber-300 bg-amber-50 text-amber-950",
      )}
    >
      <p className="font-semibold">
        {critical
          ? t("admin.hostingBannerCritical")
          : t("admin.hostingBannerWarn")}
      </p>
      <p className="mt-1">
        {report.recommendations[0] ?? t("admin.hostingBannerFallback")}
      </p>
      <Link href="/admin/hosting" className="mt-2 inline-block font-medium underline">
        {t("admin.hostingBannerLink")}
      </Link>
    </div>
  );
}
