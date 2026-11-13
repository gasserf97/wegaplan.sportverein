import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyReservationsList } from "@/components/court-booking";
import { getCurrentUser } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("tennis.myTitle") };
}

export default async function MyReservationsPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/tennisplatz/meine");
  }

  const reservations = await prisma.courtReservation.findMany({
    where: {
      userId: user.id,
      status: "CONFIRMED",
      startsAt: { gte: new Date() },
    },
    include: { court: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/tennisplatz"
        className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("tennis.backToCalendar")}
      </Link>
      <h1 className="mt-4 text-3xl text-primary sm:text-4xl">{t("tennis.myTitle")}</h1>
      <p className="mt-2 text-muted-foreground">
        {t("tennis.myDesc", { name: user.name })}
      </p>
      <div className="mt-8">
        <MyReservationsList
          reservations={reservations.map((r) => ({
            id: r.id,
            courtName: r.court.name,
            category: r.court.category,
            label: r.label?.trim() || null,
            seriesId: r.seriesId,
            startsAt: r.startsAt.toISOString(),
            endsAt: r.endsAt.toISOString(),
            status: r.status,
            priceCents: r.priceCents,
            paidAt: r.paidAt?.toISOString() ?? null,
            cancelRefundMinutesBeforeStart: r.court.cancelRefundMinutesBeforeStart,
          }))}
        />
      </div>
    </div>
  );
}
