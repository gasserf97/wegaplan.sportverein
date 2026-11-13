import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeviceBookingCalendar } from "@/components/device-booking";
import { DeviceCheckoutCleanup } from "@/components/court-checkout-cleanup";
import { expireStalePendingDeviceReservationsAction } from "@/app/actions/devices";
import { getCurrentUser } from "@/lib/auth";
import {
  addDays,
  endOfDay,
  parseDateParam,
  startOfWeekMonday,
  toDateParam,
} from "@/lib/booking";
import { checkoutHoldSince } from "@/lib/checkout-hold";
import { getCreditBalance } from "@/lib/credit";
import { getServerI18n } from "@/lib/i18n";
import { canBookFleetDevices } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("autos.title") };
}

export default async function AutosPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; woche?: string }>;
}) {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/autos");
  }

  const fleetAllowed = await canBookFleetDevices(user);
  if (!fleetAllowed) {
    redirect("/");
  }
  const creditBalanceCents = await getCreditBalance(user.id);

  await expireStalePendingDeviceReservationsAction();

  const { tag, woche } = await searchParams;
  const weekStart = startOfWeekMonday(parseDateParam(woche ?? tag));
  const weekStartIso = toDateParam(weekStart);
  const day = parseDateParam(tag ?? weekStartIso);
  const dayIso = toDateParam(day);
  const rangeStart = weekStart;
  const rangeEnd = endOfDay(addDays(weekStart, 6));
  const holdSince = checkoutHoldSince();

  const [devices, reservations, lastReasonRow] = await Promise.all([
    prisma.device.findMany({
      where: { active: true, category: "Fahrzeug" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.deviceReservation.findMany({
      where: {
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", createdAt: { gte: holdSince } },
        ],
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        device: { category: "Fahrzeug" },
      },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.deviceReservation.findFirst({
      where: {
        userId: user.id,
        reason: { not: "" },
        status: { in: ["CONFIRMED", "PENDING", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { reason: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            {t("autos.eyebrow")}
          </p>
          <h1 className="text-3xl text-primary sm:text-5xl">{t("autos.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {t("autos.description")}
          </p>
        </div>
        <Link
          href="/autos/meine"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          {t("autos.myReservations")}
        </Link>
      </div>

      <DeviceCheckoutCleanup />
      <DeviceBookingCalendar
        weekStartIso={weekStartIso}
        dayIso={dayIso}
        currentUserId={user.id}
        canBook
        lastReason={lastReasonRow?.reason ?? ""}
        creditBalanceCents={creditBalanceCents}
        devices={devices.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          blocked: d.blocked,
          pricingMode: d.pricingMode,
          priceCents: d.priceCents,
        }))}
        reservations={reservations.map((r) => ({
          id: r.id,
          deviceId: r.deviceId,
          userId: r.userId,
          userName: r.user.name,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          billingMode: r.billingMode,
          reason: r.reason,
        }))}
      />
    </div>
  );
}
