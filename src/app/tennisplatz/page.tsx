import type { Metadata } from "next";
import Link from "next/link";
import { CourtBookingCalendar } from "@/components/court-booking";
import { CourtCheckoutCleanup } from "@/components/court-checkout-cleanup";
import { TennisWhatsAppBanner } from "@/components/tennis-whatsapp-invite";
import { getCurrentUser } from "@/lib/auth";
import { BOOKING, parseDateParam, toDateParam } from "@/lib/booking";
import {
  courtCheckoutHoldSince,
  reservationDisplayLabel,
} from "@/lib/court-booking";
import { getSpendableCourtCreditCents } from "@/lib/pending-refund";
import { getServerI18n } from "@/lib/i18n";
import { hasActiveTennisSeasonCard } from "@/lib/membership";
import { canBookLongTennisSlots } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { expireStalePendingCourtReservations } from "@/app/actions/court-checkout";
import { tennisWhatsAppInviteDismissed } from "@/lib/tennis-whatsapp-status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("tennis.title") };
}

export default async function TennisCourtPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { t } = await getServerI18n();
  const { tag } = await searchParams;
  const day = parseDateParam(tag);
  const dayIso = toDateParam(day);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  const holdSince = courtCheckoutHoldSince();

  await expireStalePendingCourtReservations();

  const user = await getCurrentUser();
  const longSlots = user ? await canBookLongTennisSlots(user) : false;
  const hasSeasonCard = user ? await hasActiveTennisSeasonCard(user.id) : false;
  const creditBalanceCents = user
    ? await getSpendableCourtCreditCents(user.id)
    : 0;
  const calendarProfile = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          calendarSyncEnabled: true,
          calendarSyncTennisPromptDismissed: true,
        },
      })
    : null;
  const hideWhatsAppInvite = await tennisWhatsAppInviteDismissed(
    user?.id ?? null,
  );
  const offerCalendarSync = Boolean(
    calendarProfile &&
      !calendarProfile.calendarSyncEnabled &&
      !calendarProfile.calendarSyncTennisPromptDismissed,
  );

  const [courts, reservations] = await Promise.all([
    prisma.court.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.courtReservation.findMany({
      where: {
        startsAt: { lt: dayEnd },
        endsAt: { gt: day },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", createdAt: { gte: holdSince } },
        ],
      },
      include: {
        user: { select: { id: true, name: true } },
        court: {
          select: { name: true, cancelRefundMinutesBeforeStart: true },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <CourtCheckoutCleanup />
      {hideWhatsAppInvite ? null : (
        <div className="mb-3">
          <TennisWhatsAppBanner />
        </div>
      )}
      <CourtBookingCalendar
        dayIso={dayIso}
        courts={courts}
        currentUserId={user?.id ?? null}
        isLoggedIn={Boolean(user)}
        canManageBlocks={longSlots}
        hasSeasonCard={hasSeasonCard}
        creditBalanceCents={creditBalanceCents}
        bookerName={user?.name ?? null}
        offerCalendarSync={offerCalendarSync}
        maxDurationHours={
          longSlots ? BOOKING.closeHour - BOOKING.openHour : BOOKING.maxHoursPerBooking
        }
        reservations={reservations.map((r) => {
          const isGuest = !r.userId;
          const hasLabel = Boolean(r.label?.trim());
          return {
            id: r.id,
            courtId: r.courtId,
            courtName:
              r.court?.name ??
              courts.find((c) => c.id === r.courtId)?.name ??
              "",
            userId: r.userId,
            userName: !user
              ? t("tennis.reserved")
              : isGuest && !hasLabel
                ? (r.guestName?.trim() || t("tennis.guestBadge"))
                : reservationDisplayLabel(r),
            label: r.label?.trim() || null,
            seriesId: r.seriesId,
            isGuest,
            guestEmail: r.guestEmail?.trim() || null,
            startsAt: r.startsAt.toISOString(),
            endsAt: r.endsAt.toISOString(),
            priceCents: r.priceCents,
            paidAt: r.paidAt?.toISOString() ?? null,
            cancelRefundMinutesBeforeStart:
              r.court?.cancelRefundMinutesBeforeStart ??
              courts.find((c) => c.id === r.courtId)
                ?.cancelRefundMinutesBeforeStart ??
              120,
          };
        })}
      />

      {user ? (
        <div className="mt-8 border-t border-border pt-6">
          <Link
            href="/tennisplatz/meine"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            {t("tennis.myReservations")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
