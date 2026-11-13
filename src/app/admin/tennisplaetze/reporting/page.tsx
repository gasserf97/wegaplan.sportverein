import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireCourseManager } from "@/lib/auth";
import {
  availableTennisSeasonYears,
  defaultTennisSeasonYear,
  formatReportHours,
  formatUtilizationPercent,
  loadTennisSeasonReport,
  TENNIS_PEAK_END_HOUR,
  TENNIS_PEAK_START_HOUR,
} from "@/lib/tennis-season-report";
import { canAccessStaffAdmin, canAccessTennisReporting } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tennis-Saison Reporting",
};

export default async function TennisSeasonReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>;
}) {
  const manager = await requireCourseManager();
  if (!manager || !(await canAccessTennisReporting(manager))) {
    redirect("/admin");
  }
  const isStaffAdmin = await canAccessStaffAdmin(manager);

  const { saison } = await searchParams;
  const years = availableTennisSeasonYears();
  const parsed = Number.parseInt(saison ?? "", 10);
  const year =
    Number.isFinite(parsed) && years.includes(parsed)
      ? parsed
      : defaultTennisSeasonYear();

  const report = await loadTennisSeasonReport(year);
  const peakHoursPerDay = TENNIS_PEAK_END_HOUR - TENNIS_PEAK_START_HOUR;
  const [whatsappAlreadyMember, whatsappNoInterest] = await Promise.all([
    prisma.tennisWhatsAppResponse.count({
      where: { choice: "ALREADY_MEMBER" },
    }),
    prisma.tennisWhatsAppResponse.count({
      where: { choice: "NO_INTEREST" },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <Link
        href={isStaffAdmin ? "/admin/tennisplaetze" : "/admin"}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {isStaffAdmin ? "← Tennisplätze" : "← Admin"}
      </Link>
      <h1 className="mt-4 text-4xl text-primary">Tennis-Saison Reporting</h1>
      <p className="mt-2 text-muted-foreground">
        Gebuchte Stunden und Auslastung {report.peakWindowLabel} – alle Plätze
        zusammengefasst, Saison April bis Oktober.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">
            WhatsApp: „Ich bin schon Mitglied“
          </p>
          <p className="mt-1 font-heading text-3xl">{whatsappAlreadyMember}</p>
        </div>
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">
            WhatsApp: „Kein Interesse“
          </p>
          <p className="mt-1 font-heading text-3xl">{whatsappNoInterest}</p>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Saison</span>
          <select
            name="saison"
            defaultValue={String(year)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item} (Apr–Okt)
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Anzeigen
        </button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Aktive Plätze</p>
          <p className="mt-1 font-heading text-3xl">{report.courtCount}</p>
        </div>
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Buchungen in der Saison</p>
          <p className="mt-1 font-heading text-3xl">
            {report.reservationCount}
          </p>
        </div>
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">
            Gebuchte Stunden gesamt
          </p>
          <p className="mt-1 font-heading text-3xl">
            {formatReportHours(report.totals.bookedHours)}
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Monat</TableHead>
              <TableHead className="text-right">Gebuchte Stunden</TableHead>
              <TableHead className="text-right">
                Gebucht {report.peakWindowLabel}
              </TableHead>
              <TableHead className="text-right">
                Auslastung {report.peakWindowLabel}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.months.map((row) => (
              <TableRow key={row.month}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatReportHours(row.bookedHours)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatReportHours(row.peakBookedHours)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUtilizationPercent(row.peakUtilizationPercent)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-medium">
              <TableCell>Saison gesamt</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatReportHours(report.totals.bookedHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatReportHours(report.totals.peakBookedHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatUtilizationPercent(report.totals.peakUtilizationPercent)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Auslastung = gebuchte Stunden im Zeitfenster {report.peakWindowLabel} /
        verfügbare Stunden aller aktiven Plätze (jeden Tag × {peakHoursPerDay}{" "}
        Std. × {report.courtCount} Plätze). Nur bestätigte Buchungen.
      </p>
    </div>
  );
}
