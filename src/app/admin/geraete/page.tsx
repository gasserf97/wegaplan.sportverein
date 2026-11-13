import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminDevicesPanel } from "@/components/admin-devices";
import { requireAdmin } from "@/lib/auth";
import { addDays } from "@/lib/booking";
import { formatEuro } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { sectionListOrderBy } from "@/lib/section-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fuhrpark verwalten" };

export default async function AdminDevicesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const now = new Date();
  const weekEnd = addDays(now, 7);

  const [devices, reservations, weekCounts, upcomingCounts, sections] = await Promise.all([
    prisma.device.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.deviceReservation.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: now } },
      include: { device: true, user: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
      take: 40,
    }),
    prisma.deviceReservation.groupBy({
      by: ["deviceId"],
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: now, lte: weekEnd },
      },
      _count: { _all: true },
    }),
    prisma.deviceReservation.groupBy({
      by: ["deviceId"],
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: now },
      },
      _count: { _all: true },
    }),
    prisma.section.findMany({
      orderBy: sectionListOrderBy,
      select: { id: true, name: true },
    }),
  ]);

  const countMap = new Map(weekCounts.map((c) => [c.deviceId, c._count._all]));
  const upcomingMap = new Map(upcomingCounts.map((c) => [c.deviceId, c._count._all]));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <Link href="/admin" className="text-sm text-primary underline-offset-4 hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-4 text-4xl text-primary">Fuhrpark</h1>
      <p className="mt-2 text-muted-foreground">
        Fahrzeuge anlegen, Preise (pro Stunde oder pro Tag) setzen und Reservierungen
        verwalten.
      </p>
      <div className="mt-8">
        <AdminDevicesPanel
          sections={sections}
          devices={devices.map((d) => ({
            id: d.id,
            name: d.name,
            category: d.category,
            blocked: d.blocked,
            pricingMode: d.pricingMode,
            priceCents: d.priceCents,
            sectionId: d.sectionId,
            reservationCount: countMap.get(d.id) ?? 0,
            upcomingCount: upcomingMap.get(d.id) ?? 0,
          }))}
          reservations={reservations.map((r) => ({
            id: r.id,
            deviceName: r.device.name,
            userName: r.user.name,
            startsAt: r.startsAt.toISOString(),
            endsAt: r.endsAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
            billingMode: r.billingMode,
            priceCents: r.priceCents,
            reason: r.reason,
          }))}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Hinweis: Preise werden in Cent gespeichert (
        {formatEuro(5000)} Beispiel).
      </p>
    </div>
  );
}
