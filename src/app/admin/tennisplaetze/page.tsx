import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminCourtsPanel } from "@/components/admin-courts";
import { requireAdmin } from "@/lib/auth";
import { addDays } from "@/lib/booking";
import { reservationDisplayLabel } from "@/lib/court-booking";
import { prisma } from "@/lib/prisma";
import { sectionListOrderBy } from "@/lib/section-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tennisplätze verwalten" };

export default async function AdminCourtsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const now = new Date();
  const weekEnd = addDays(now, 7);

  const [courts, reservations, weekCounts, upcomingCounts, sections] = await Promise.all([
    prisma.court.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.courtReservation.findMany({
      where: { status: "CONFIRMED", startsAt: { gte: now } },
      include: {
        court: true,
        user: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 30,
    }),
    prisma.courtReservation.groupBy({
      by: ["courtId"],
      where: {
        status: "CONFIRMED",
        startsAt: { gte: now, lte: weekEnd },
      },
      _count: { _all: true },
    }),
    prisma.courtReservation.groupBy({
      by: ["courtId"],
      where: {
        status: "CONFIRMED",
        startsAt: { gte: now },
      },
      _count: { _all: true },
    }),
    prisma.section.findMany({
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
  ]);

  const countMap = new Map(weekCounts.map((c) => [c.courtId, c._count._all]));
  const upcomingMap = new Map(upcomingCounts.map((c) => [c.courtId, c._count._all]));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <Link href="/admin" className="text-sm text-primary underline-offset-4 hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-4 text-4xl text-primary">Tennisplätze</h1>
      <p className="mt-2 text-muted-foreground">
        Plätze anlegen, sperren und Reservierungen verwalten.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/tennisplaetze/reporting"
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Saison-Reporting
        </Link>
      </div>
      <div className="mt-8">
        <AdminCourtsPanel
          sections={sections}
          courts={courts.map((c) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            blocked: c.blocked,
            priceCentsPerHour: c.priceCentsPerHour,
            cancelRefundMinutesBeforeStart: c.cancelRefundMinutesBeforeStart,
            sectionId: c.sectionId,
            reservationCount: countMap.get(c.id) ?? 0,
            upcomingCount: upcomingMap.get(c.id) ?? 0,
          }))}
          reservations={reservations.map((r) => {
            const isGuest = !r.userId;
            return {
              id: r.id,
              courtName: r.court.name,
              userName: reservationDisplayLabel(r),
              isGuest,
              guestEmail: r.guestEmail?.trim() || null,
              startsAt: r.startsAt.toISOString(),
              endsAt: r.endsAt.toISOString(),
              createdAt: r.createdAt.toISOString(),
            };
          })}
        />
      </div>
    </div>
  );
}
