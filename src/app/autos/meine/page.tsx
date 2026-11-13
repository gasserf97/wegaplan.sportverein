import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyDeviceReservationsList } from "@/components/device-booking";
import { getCurrentUser } from "@/lib/auth";
import { checkoutHoldSince } from "@/lib/checkout-hold";
import { expireStalePendingDeviceReservations } from "@/lib/expire-pending";
import { getServerI18n } from "@/lib/i18n";
import { canBookFleetDevices } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("autos.myTitle") };
}

export default async function MyAutosPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/autos/meine");
  }
  if (!(await canBookFleetDevices(user))) {
    redirect("/");
  }

  await expireStalePendingDeviceReservations();
  const holdSince = checkoutHoldSince();

  const reservations = await prisma.deviceReservation.findMany({
    where: {
      userId: user.id,
      startsAt: { gte: new Date() },
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING", createdAt: { gte: holdSince } },
      ],
    },
    include: { device: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/autos"
        className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("autos.backToBooking")}
      </Link>
      <h1 className="mt-4 text-3xl text-primary sm:text-4xl">{t("autos.myTitle")}</h1>
      <p className="mt-2 text-muted-foreground">
        {t("autos.myDesc", { name: user.name })}
      </p>
      <div className="mt-8">
        <MyDeviceReservationsList
          reservations={reservations.map((r) => ({
            id: r.id,
            deviceName: r.device.name,
            startsAt: r.startsAt.toISOString(),
            endsAt: r.endsAt.toISOString(),
            billingMode: r.billingMode,
            priceCents: r.priceCents,
            status: r.status,
            reason: r.reason,
          }))}
        />
      </div>
    </div>
  );
}
