import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CONCURRENT_METRIC_ID,
  concurrentValueLabel,
  countOnlineUsers,
  ONLINE_WINDOW_MS,
} from "@/lib/concurrent-users";
import { prisma } from "@/lib/prisma";
import { CLUB_TIMEZONE } from "@/lib/format";

export type HealthLevel = "ok" | "warn" | "critical" | "unknown";

export type HealthMetric = {
  id: string;
  label: string;
  level: HealthLevel;
  valueLabel: string;
  detail?: string;
  percent?: number | null;
  upgradeHint?: string | null;
  /** Numeric sample used to track all-time high (bytes, ms, percent, counts). */
  sampleValue?: number | null;
  /** Peak line shows calendar date only (daily counters). */
  peakDayOnly?: boolean;
  peak?: {
    valueLabel: string;
    at: string;
  } | null;
};

export type HostingHealthReport = {
  checkedAt: string;
  overall: HealthLevel;
  metrics: HealthMetric[];
  recommendations: string[];
  renderConfigured: boolean;
  renderError?: string;
};

const WARN_PCT = 70;
const CRITICAL_PCT = 85;

/** Limits matching render.yaml defaults (Starter web + Basic-256mb Postgres). */
const WEB_RAM_BYTES = 512 * 1024 * 1024;
const DB_RAM_BYTES = 256 * 1024 * 1024;
const DB_CONN_LIMIT = 100;
const DISK_BYTES = 1 * 1024 * 1024 * 1024;

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function levelFromPercent(percent: number | null | undefined): HealthLevel {
  if (percent == null || !Number.isFinite(percent)) return "unknown";
  if (percent >= CRITICAL_PCT) return "critical";
  if (percent >= WARN_PCT) return "warn";
  return "ok";
}

function worstLevel(levels: HealthLevel[]): HealthLevel {
  if (levels.includes("critical")) return "critical";
  if (levels.includes("warn")) return "warn";
  if (levels.includes("ok")) return "ok";
  return "unknown";
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatPercent(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent)) return "—";
  return `${Math.round(percent)} %`;
}

function lastSeriesValue(
  payload: unknown,
): { value: number; unit?: string } | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const series = payload[0] as {
    unit?: string;
    values?: Array<{ value?: number }>;
  };
  const values = series.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  const last = values[values.length - 1];
  if (typeof last?.value !== "number" || !Number.isFinite(last.value)) {
    return null;
  }
  return { value: last.value, unit: series.unit };
}

function toBytes(value: number, unit?: string) {
  const u = (unit ?? "").toUpperCase();
  if (u === "GB") return value * 1024 ** 3;
  if (u === "MB") return value * 1024 ** 2;
  if (u === "KB") return value * 1024;
  return value;
}

function calendarDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function collectDailyLoginMetric(): Promise<HealthMetric> {
  const today = calendarDayKey(new Date());
  let count = 0;
  try {
    const recent = await prisma.user.findMany({
      where: {
        lastLoginAt: { gte: new Date(Date.now() - 36 * 60 * 60 * 1000) },
      },
      select: { lastLoginAt: true },
    });
    count = recent.filter(
      (row) => row.lastLoginAt && calendarDayKey(row.lastLoginAt) === today,
    ).length;
  } catch (error) {
    console.error("Hosting-Logins heute", error);
  }
  return {
    id: "logins_today",
    label: "User angemeldet (heute)",
    level: "ok",
    valueLabel: String(count),
    detail:
      count === 1
        ? "1 Person war heute in der App online (angemeldet)."
        : `${count} Personen waren heute in der App online (angemeldet).`,
    sampleValue: count,
    peakDayOnly: true,
  };
}

async function collectConcurrentUsersMetric(): Promise<HealthMetric> {
  let count = 0;
  try {
    count = await countOnlineUsers();
  } catch (error) {
    console.error("Hosting-User gleichzeitig", error);
  }
  const windowLabel =
    ONLINE_WINDOW_MS <= 60_000
      ? "der letzten Minute"
      : `den letzten ${Math.round(ONLINE_WINDOW_MS / 60_000)} Minuten`;
  return {
    id: CONCURRENT_METRIC_ID,
    label: "User gleichzeitig online",
    level: "ok",
    valueLabel: concurrentValueLabel(count),
    detail:
      count === 0
        ? `Keine angemeldete Aktivität in ${windowLabel}.`
        : count === 1
          ? `1 angemeldete Person war in ${windowLabel} aktiv.`
          : `${count} angemeldete Personen waren in ${windowLabel} aktiv.`,
    sampleValue: count,
  };
}

async function fetchRenderMetric(
  kind: "memory" | "cpu",
  resourceId: string,
  apiKey: string,
) {
  const end = new Date();
  const start = new Date(end.getTime() - 15 * 60 * 1000);
  const params = new URLSearchParams({
    resource: resourceId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    resolutionSeconds: "60",
    aggregationMethod: "AVG",
  });
  const response = await fetch(
    `https://api.render.com/v1/metrics/${kind}?${params}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Render ${kind} ${response.status}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

async function dirSizeBytes(root: string): Promise<number | null> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        const nested = await dirSizeBytes(full);
        if (nested != null) total += nested;
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        total += stat.size;
      }
    }
    return total;
  } catch {
    return null;
  }
}

async function collectLocalMetrics(): Promise<HealthMetric[]> {
  const metrics: HealthMetric[] = [];
  const mem = process.memoryUsage();
  const rssPercent = (mem.rss / WEB_RAM_BYTES) * 100;
  const rssLevel = levelFromPercent(rssPercent);
  metrics.push({
    id: "web_rss",
    label: "App-Speicher (Node RSS)",
    level: rssLevel,
    valueLabel: `${formatBytes(mem.rss)} / ${formatBytes(WEB_RAM_BYTES)} (${formatPercent(rssPercent)})`,
    detail:
      "Geschätzt gegen Starter-Limit (512 MB). Mit Render-API genauer.",
    percent: rssPercent,
    sampleValue: mem.rss,
    upgradeHint:
      rssLevel === "ok"
        ? null
        : "Web-Service in Render auf Standard (2 GB RAM) hochstufen.",
  });

  const uploadRoot = env("UPLOAD_DIR") || path.join(process.cwd(), "uploads");
  const usedDisk = await dirSizeBytes(uploadRoot);
  if (usedDisk != null) {
    const diskPercent = (usedDisk / DISK_BYTES) * 100;
    const diskLevel = levelFromPercent(diskPercent);
    metrics.push({
      id: "disk",
      label: "Upload-Speicher",
      level: diskLevel,
      valueLabel: `${formatBytes(usedDisk)} / ${formatBytes(DISK_BYTES)} (${formatPercent(diskPercent)})`,
      detail: uploadRoot,
      percent: diskPercent,
      sampleValue: usedDisk,
      upgradeHint:
        diskLevel === "ok"
          ? null
          : "Persistente Disk in Render vergrößern (Web-Service → Disk).",
    });
  }

  try {
    const t0 = Date.now();
    const rows = await prisma.$queryRaw<
      Array<{ db_bytes: bigint; connections: bigint }>
    >`
      SELECT
        pg_database_size(current_database())::bigint AS db_bytes,
        (SELECT count(*)::bigint FROM pg_stat_activity WHERE datname = current_database()) AS connections
    `;
    const latencyMs = Date.now() - t0;
    const row = rows[0];
    const dbBytes = Number(row?.db_bytes ?? 0);
    const connections = Number(row?.connections ?? 0);

    const storageGuideBytes = 2 * 1024 * 1024 * 1024;
    const storagePercent = (dbBytes / storageGuideBytes) * 100;
    const storageLevel =
      dbBytes >= 1.5 * 1024 ** 3
        ? "critical"
        : dbBytes >= 1 * 1024 ** 3
          ? "warn"
          : "ok";

    metrics.push({
      id: "db_size",
      label: "Postgres-Datenmenge",
      level: storageLevel,
      valueLabel: formatBytes(dbBytes),
      detail: `Richtwert für Upgrade ab ca. 1 GB (aktuell ${formatPercent(storagePercent)} von 2 GB).`,
      percent: Math.min(storagePercent, 100),
      sampleValue: dbBytes,
      upgradeHint:
        storageLevel === "ok"
          ? null
          : "Postgres in Render auf Basic-1gb (oder größer) hochstufen und Speicher erweitern.",
    });

    const connPercent = (connections / DB_CONN_LIMIT) * 100;
    const connLevel = levelFromPercent(connPercent);
    metrics.push({
      id: "db_connections",
      label: "Postgres-Verbindungen",
      level: connLevel,
      valueLabel: `${connections} / ${DB_CONN_LIMIT} (${formatPercent(connPercent)})`,
      percent: connPercent,
      sampleValue: connections,
      upgradeHint:
        connLevel === "ok"
          ? null
          : "Postgres-Plan erhöhen oder Verbindungen prüfen (zu viele parallele Clients).",
    });

    const latencyLevel =
      latencyMs >= 800 ? "critical" : latencyMs >= 300 ? "warn" : "ok";
    metrics.push({
      id: "db_latency",
      label: "DB-Antwortzeit",
      level: latencyLevel,
      valueLabel: `${latencyMs} ms`,
      detail: "Einfache Statusabfrage.",
      sampleValue: latencyMs,
      upgradeHint:
        latencyLevel === "ok"
          ? null
          : "Postgres-Plan erhöhen oder langsame Queries/Last prüfen.",
    });
  } catch (error) {
    metrics.push({
      id: "db_error",
      label: "Postgres",
      level: "critical",
      valueLabel: "nicht erreichbar",
      detail: error instanceof Error ? error.message : "Unbekannter DB-Fehler",
      upgradeHint: "Datenbankstatus in Render prüfen (Postgres-Service).",
    });
  }

  return metrics;
}

async function applyMetricPeaks(metrics: HealthMetric[]) {
  const now = new Date();
  const ids = metrics.map((metric) => metric.id);
  const existing =
    ids.length === 0
      ? []
      : await prisma.hostingMetricPeak.findMany({
          where: { metricId: { in: ids } },
        });
  const byId = new Map(existing.map((row) => [row.metricId, row]));

  for (const metric of metrics) {
    const sample = metric.sampleValue;
    if (sample == null || !Number.isFinite(sample)) {
      const row = byId.get(metric.id);
      metric.peak = row
        ? { valueLabel: row.peakLabel, at: row.peakedAt.toISOString() }
        : null;
      continue;
    }

    const previous = byId.get(metric.id);
    if (!previous || sample > previous.peakValue) {
      const saved = await prisma.hostingMetricPeak.upsert({
        where: { metricId: metric.id },
        create: {
          metricId: metric.id,
          peakValue: sample,
          peakLabel: metric.valueLabel,
          peakedAt: now,
        },
        update: {
          peakValue: sample,
          peakLabel: metric.valueLabel,
          peakedAt: now,
        },
      });
      metric.peak = {
        valueLabel: saved.peakLabel,
        at: saved.peakedAt.toISOString(),
      };
    } else {
      metric.peak = {
        valueLabel: previous.peakLabel,
        at: previous.peakedAt.toISOString(),
      };
    }
  }
}

async function collectRenderMetrics(): Promise<{
  metrics: HealthMetric[];
  error?: string;
  configured: boolean;
}> {
  const apiKey = env("RENDER_API_KEY");
  const serviceId = env("RENDER_SERVICE_ID");
  const postgresId = env("RENDER_POSTGRES_ID");
  if (!apiKey || (!serviceId && !postgresId)) {
    return { metrics: [], configured: false };
  }

  const metrics: HealthMetric[] = [];
  const errors: string[] = [];

  if (serviceId) {
    try {
      const [memJson, cpuJson] = await Promise.all([
        fetchRenderMetric("memory", serviceId, apiKey),
        fetchRenderMetric("cpu", serviceId, apiKey),
      ]);
      const mem = lastSeriesValue(memJson);
      if (mem) {
        const usageBytes =
          mem.unit || mem.value > 10_000
            ? toBytes(mem.value, mem.unit)
            : mem.value * 1024 ** 2;
        const percent = (usageBytes / WEB_RAM_BYTES) * 100;
        const level = levelFromPercent(percent);
        metrics.push({
          id: "render_web_memory",
          label: "Render Web – RAM",
          level,
          valueLabel: `${formatBytes(usageBytes)} / ${formatBytes(WEB_RAM_BYTES)} (${formatPercent(percent)})`,
          detail: `Service ${serviceId}`,
          percent,
          sampleValue: usageBytes,
          upgradeHint:
            level === "ok"
              ? null
              : "Web-Service auf Standard (2 GB) hochstufen.",
        });
      }
      const cpu = lastSeriesValue(cpuJson);
      if (cpu) {
        let percent = cpu.value;
        if (percent <= 2) percent = percent * 100;
        const level = levelFromPercent(percent);
        metrics.push({
          id: "render_web_cpu",
          label: "Render Web – CPU",
          level,
          valueLabel: formatPercent(percent),
          detail: `Service ${serviceId}`,
          percent,
          sampleValue: percent,
          upgradeHint:
            level === "ok" ? null : "Web-Service auf Standard hochstufen.",
        });
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Web-Metriken fehlgeschlagen",
      );
    }
  }

  if (postgresId) {
    try {
      const memJson = await fetchRenderMetric("memory", postgresId, apiKey);
      const mem = lastSeriesValue(memJson);
      if (mem) {
        const usageBytes =
          mem.unit || mem.value > 10_000
            ? toBytes(mem.value, mem.unit)
            : mem.value * 1024 ** 2;
        const percent = (usageBytes / DB_RAM_BYTES) * 100;
        const level = levelFromPercent(percent);
        metrics.push({
          id: "render_db_memory",
          label: "Render Postgres – RAM",
          level,
          valueLabel: `${formatBytes(usageBytes)} / ${formatBytes(DB_RAM_BYTES)} (${formatPercent(percent)})`,
          detail: `Database ${postgresId}`,
          percent,
          sampleValue: usageBytes,
          upgradeHint:
            level === "ok"
              ? null
              : "Postgres auf Basic-1gb hochstufen.",
        });
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Postgres-Metriken fehlgeschlagen",
      );
    }
  }

  return {
    metrics,
    configured: true,
    error: errors.length > 0 ? errors.join(" · ") : undefined,
  };
}

export async function getHostingHealth(): Promise<HostingHealthReport> {
  const [logins, concurrent, local, render] = await Promise.all([
    collectDailyLoginMetric(),
    collectConcurrentUsersMetric(),
    collectLocalMetrics(),
    collectRenderMetrics(),
  ]);

  const metrics = [logins, concurrent, ...render.metrics, ...local];
  try {
    await applyMetricPeaks(metrics);
  } catch (error) {
    console.error("Hosting-Höchststände", error);
  }
  const overall = worstLevel(metrics.map((m) => m.level));
  const recommendations = [
    ...new Set(
      metrics
        .map((m) => m.upgradeHint)
        .filter((hint): hint is string => Boolean(hint)),
    ),
  ];

  if (!render.configured) {
    recommendations.push(
      "Für genaue Render-CPU/RAM: RENDER_API_KEY, RENDER_SERVICE_ID und RENDER_POSTGRES_ID in Render Environment setzen.",
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    overall,
    metrics,
    recommendations,
    renderConfigured: render.configured,
    renderError: render.error,
  };
}

export function hostingNeedsAttention(report: HostingHealthReport) {
  return report.overall === "warn" || report.overall === "critical";
}
