"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createReservationAction,
  type CancelReservationScope,
  type ReservationActionState,
} from "@/app/actions/reservations";
import { CalendarSyncOffer } from "@/components/calendar-sync-offer";
import { rememberCourtPendingCheckout } from "@/components/court-checkout-cleanup";
import {
  BOOKING,
  addDays,
  buildDaySlots,
  durationOptions,
  formatSlotDate,
  formatSlotTime,
  slotEnd,
  toDateParam,
} from "@/lib/booking";
import {
  canCancelGuestReservation,
  canCancelPaidCourtReservation,
  courtBookingPriceCents,
  courtReservationIsPaid,
  formatCancelRefundMinutes,
  isoWeekday,
} from "@/lib/court-booking";
import { formatEuro } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

function reservationIsPaid(item: {
  priceCents: number;
  paidAt: string | null;
}) {
  return courtReservationIsPaid({
    priceCents: item.priceCents,
    paidAt: item.paidAt ? new Date(item.paidAt) : null,
  });
}

/** Paid: only within court deadline. Free/season card: always. */
function canCancelCourtReservation(
  item: {
    status?: string;
    priceCents: number;
    paidAt: string | null;
    startsAt: string;
    cancelRefundMinutesBeforeStart: number;
  },
  now = new Date(),
) {
  if (item.status && item.status !== "CONFIRMED") return false;
  const paid = reservationIsPaid(item);
  if (!paid) return true;
  return canCancelPaidCourtReservation(
    new Date(item.startsAt),
    item.cancelRefundMinutesBeforeStart,
    now,
  );
}

type Court = {
  id: string;
  name: string;
  category: string;
  blocked: boolean;
  priceCentsPerHour: number;
  sectionId?: string | null;
};

type ReservationCell = {
  id: string;
  courtId: string;
  courtName: string;
  userId: string | null;
  userName: string;
  label?: string | null;
  seriesId?: string | null;
  isGuest?: boolean;
  guestEmail?: string | null;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  paidAt: string | null;
  cancelRefundMinutesBeforeStart: number;
};

type PendingSlot = {
  courtId: string;
  courtName: string;
  courtPriceCentsPerHour: number;
  sectionId: string | null;
  startsAt: string;
};

export function CourtBookingCalendar({
  dayIso,
  courts,
  reservations,
  currentUserId,
  isLoggedIn,
  canManageBlocks = false,
  maxDurationHours,
  hasSeasonCard,
  creditBalanceCents = 0,
  sectionCreditCents = {},
  bookerName,
  offerCalendarSync = false,
}: {
  dayIso: string;
  courts: Court[];
  reservations: ReservationCell[];
  currentUserId: string | null;
  isLoggedIn: boolean;
  canManageBlocks?: boolean;
  maxDurationHours: number;
  hasSeasonCard: boolean;
  creditBalanceCents?: number;
  /** Zusätzliches Guthaben je Sektion (Platz-Sektion). */
  sectionCreditCents?: Record<string, number>;
  bookerName: string | null;
  /** Nach kostenloser Buchung Kalender-Sync anbieten. */
  offerCalendarSync?: boolean;
}) {
  const router = useRouter();
  const day = useMemo(() => new Date(`${dayIso}T12:00:00`), [dayIso]);
  const now = useMemo(() => new Date(), []);
  const [calendarOfferOpen, setCalendarOfferOpen] = useState(false);
  const slots = useMemo(() => {
    const all = buildDaySlots(day);
    if (dayIso !== toDateParam(now)) return all;
    // Heute: vergangene Slots ausblenden, aktueller Slot bleibt sichtbar
    return all.filter((slot) => slotEnd(slot) > now);
  }, [day, dayIso, now]);

  function reservationCovering(courtId: string, slot: Date) {
    const slotFinish = slotEnd(slot);
    return (
      reservations.find(
        (r) =>
          r.courtId === courtId &&
          new Date(r.startsAt) < slotFinish &&
          new Date(r.endsAt) > slot,
      ) ?? null
    );
  }

  function isReservationVisibleStart(reservation: ReservationCell, slot: Date) {
    if (new Date(reservation.startsAt).getTime() === slot.getTime()) return true;
    const firstVisible = slots.find(
      (candidate) =>
        new Date(reservation.startsAt) < slotEnd(candidate) &&
        new Date(reservation.endsAt) > candidate,
    );
    return firstVisible?.getTime() === slot.getTime();
  }

  function visibleReservationSpan(reservation: ReservationCell, slot: Date) {
    const from = slots.findIndex((candidate) => candidate.getTime() === slot.getTime());
    if (from < 0) return 1;
    let count = 0;
    for (let i = from; i < slots.length; i++) {
      const candidate = slots[i];
      if (
        new Date(reservation.startsAt) < slotEnd(candidate) &&
        new Date(reservation.endsAt) > candidate
      ) {
        count += 1;
      } else {
        break;
      }
    }
    return Math.max(1, count);
  }

  function minutesUntilBlocked(courtId: string, startsAt: Date) {
    const closing = new Date(startsAt);
    closing.setHours(BOOKING.closeHour, 0, 0, 0);
    let available = Math.round((closing.getTime() - startsAt.getTime()) / 60_000);
    for (const r of reservations) {
      if (r.courtId !== courtId) continue;
      const rs = new Date(r.startsAt);
      if (rs > startsAt) {
        available = Math.min(
          available,
          Math.round((rs.getTime() - startsAt.getTime()) / 60_000),
        );
      }
    }
    return Math.max(0, available);
  }

  const [pending, setPending] = useState<PendingSlot | null>(null);
  const [manage, setManage] = useState<ReservationCell | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [adminLabel, setAdminLabel] = useState("");
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesWeekday, setSeriesWeekday] = useState(1);
  const [seriesUntilDate, setSeriesUntilDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [useCredit, setUseCredit] = useState(creditBalanceCents > 0);
  const [error, setError] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [pendingAction, startAction] = useTransition();
  const { t } = useI18n();
  const adminBlockFree =
    canManageBlocks && (adminLabel.trim().length > 0 || seriesEnabled);

  const prevDay = toDateParam(addDays(day, -1));
  const nextDay = toDateParam(addDays(day, 1));
  const today = toDateParam(new Date());

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const estimatedPriceCents = useMemo(() => {
    if (!pending) return 0;
    if (isLoggedIn && hasSeasonCard) return 0;
    const endsAt = slotEnd(new Date(pending.startsAt), durationMinutes);
    return courtBookingPriceCents(
      pending.courtPriceCentsPerHour,
      new Date(pending.startsAt),
      endsAt,
    );
  }, [pending, durationMinutes, isLoggedIn, hasSeasonCard]);

  const availableCreditCents =
    creditBalanceCents +
    (pending?.sectionId ? (sectionCreditCents[pending.sectionId] ?? 0) : 0);
  const creditApplied =
    isLoggedIn && useCredit && estimatedPriceCents > 0
      ? Math.min(availableCreditCents, estimatedPriceCents)
      : 0;
  const amountDue = Math.max(0, estimatedPriceCents - creditApplied);

  function openBooking(court: Court, startsAt: Date) {
    setGuestName("");
    setGuestEmail("");
    setAdminLabel("");
    setSeriesEnabled(false);
    setSeriesWeekday(isoWeekday(startsAt));
    setSeriesUntilDate("");
    const available = minutesUntilBlocked(court.id, startsAt);
    const cap = Math.min(available, maxDurationHours * 60);
    setDurationMinutes(Math.min(60, cap) >= BOOKING.slotMinutes ? Math.min(60, cap) : cap);
    setError(null);
    if (
      creditBalanceCents > 0 ||
      (court.sectionId && (sectionCreditCents[court.sectionId] ?? 0) > 0)
    ) {
      setUseCredit(true);
    }
    setPending({
      courtId: court.id,
      courtName: court.name,
      courtPriceCentsPerHour: court.priceCentsPerHour,
      sectionId: court.sectionId ?? null,
      startsAt: startsAt.toISOString(),
    });
  }

  function confirmBooking() {
    if (!pending) return;
    startAction(async () => {
      const result: ReservationActionState = await createReservationAction(
        pending.courtId,
        pending.startsAt,
        durationMinutes,
        isLoggedIn ? undefined : guestName,
        isLoggedIn ? undefined : guestEmail,
        isLoggedIn && useCredit && !adminBlockFree,
        canManageBlocks
          ? {
              label: adminLabel,
              seriesEnabled,
              seriesWeekday,
              seriesUntilDate,
            }
          : undefined,
      );
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (result && "paymentUrl" in result) {
        rememberCourtPendingCheckout(result.reservationId);
        window.location.href = result.paymentUrl;
        return;
      }
      setPending(null);
      if (offerCalendarSync && isLoggedIn) {
        setCalendarOfferOpen(true);
      }
      router.refresh();
    });
  }

  const displayPriceCents = adminBlockFree ? 0 : estimatedPriceCents;
  const displayCreditApplied = adminBlockFree ? 0 : creditApplied;
  const displayAmountDue = adminBlockFree ? 0 : amountDue;

  const bookingForm = pending ? (
    <BookingFormFields
      pending={pending}
      durationMinutes={durationMinutes}
      setDurationMinutes={setDurationMinutes}
      maxDurationHours={maxDurationHours}
      minutesUntilBlocked={minutesUntilBlocked}
      isLoggedIn={isLoggedIn}
      canManageBlocks={canManageBlocks}
      bookerName={bookerName}
      guestName={guestName}
      setGuestName={setGuestName}
      guestEmail={guestEmail}
      setGuestEmail={setGuestEmail}
      adminLabel={adminLabel}
      setAdminLabel={setAdminLabel}
      seriesEnabled={seriesEnabled}
      setSeriesEnabled={setSeriesEnabled}
      seriesWeekday={seriesWeekday}
      setSeriesWeekday={setSeriesWeekday}
      seriesUntilDate={seriesUntilDate}
      setSeriesUntilDate={setSeriesUntilDate}
      estimatedPriceCents={displayPriceCents}
      creditBalanceCents={creditBalanceCents}
      creditApplied={displayCreditApplied}
      amountDue={displayAmountDue}
      useCredit={useCredit}
      setUseCredit={setUseCredit}
      error={error}
    />
  ) : null;

  const bookingActions = (
    <>
      <Button variant="outline" onClick={() => setPending(null)} className="min-h-11">
        Abbrechen
      </Button>
      <Button disabled={pendingAction} onClick={confirmBooking} className="min-h-11">
        {pendingAction
          ? "Bitte warten…"
          : displayAmountDue > 0
            ? "Weiter zur Zahlung"
            : displayPriceCents > 0
              ? "Mit Guthaben reservieren"
              : "Reservieren"}
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl text-primary capitalize">
            {formatSlotDate(day)}
          </h2>
          <p className="text-sm text-muted-foreground">
            ½-Stunden-Takt · {BOOKING.openHour}:00–{BOOKING.closeHour}:00 Uhr
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              aria-label="Vorheriger Tag"
              disabled={dayIso <= today}
              onClick={() => router.push(`/tennisplatz?tag=${prevDay}`)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              onClick={() => router.push(`/tennisplatz?tag=${today}`)}
            >
              Heute
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              aria-label="Nächster Tag"
              onClick={() => router.push(`/tennisplatz?tag=${nextDay}`)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-sm">
            <span className="sr-only">Datum wählen</span>
            <input
              type="date"
              value={dayIso}
              min={today}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                router.push(`/tennisplatz?tag=${value}`);
              }}
              className="min-h-9 w-full bg-transparent text-sm outline-none sm:w-auto"
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-10 w-14 bg-muted/40 px-1.5 py-2.5 text-left text-xs font-medium sm:w-20 sm:px-3 sm:py-3 sm:text-sm">
                Uhrzeit
              </th>
              {courts.map((court) => (
                <th
                  key={court.id}
                  className="min-w-0 px-1.5 py-2.5 text-center text-xs font-medium sm:min-w-28 sm:px-3 sm:py-3 sm:text-sm"
                >
                  <div className="truncate">{court.name}</div>
                  <div className="truncate text-[0.65rem] font-normal text-muted-foreground sm:text-xs">
                    {court.category}
                    {court.blocked
                      ? " · gesperrt"
                      : hasSeasonCard
                        ? null
                        : ` · ${formatEuro(court.priceCentsPerHour)}/Std.`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.length === 0 ? (
              <tr>
                <td
                  colSpan={courts.length + 1}
                  className="px-3 py-8 text-sm text-muted-foreground"
                >
                  Für heute sind keine weiteren Zeiten mehr verfügbar.
                </td>
              </tr>
            ) : null}
            {slots.map((slot) => {
              return (
                <tr key={slot.toISOString()} className="border-b border-border/70">
                  <td className="sticky left-0 z-10 bg-card px-1.5 py-1.5 text-xs font-medium tabular-nums sm:px-3 sm:py-2 sm:text-sm">
                    {formatSlotTime(slot)}
                  </td>
                  {courts.map((court) => {
                    const key = `${court.id}:${slot.toISOString()}`;
                    const reservation = reservationCovering(court.id, slot);
                    const unavailable = court.blocked;

                    if (reservation) {
                      if (!isReservationVisibleStart(reservation, slot)) {
                        return null;
                      }

                      const isOwn = Boolean(
                        currentUserId && reservation.userId === currentUserId,
                      );
                      const canOpenManage = isOwn || canManageBlocks;
                      const span = visibleReservationSpan(reservation, slot);
                      const isGuest = Boolean(reservation.isGuest);
                      const hasLabel = Boolean(reservation.label?.trim());
                      const cellLabel = isGuest && !hasLabel ? (
                        <span className="flex min-w-0 flex-col items-center gap-0.5">
                          <span className="font-semibold uppercase tracking-wide">
                            {t("tennis.guestBadge")}
                          </span>
                          {isLoggedIn ? (
                            <>
                              <span className="line-clamp-1 font-medium">
                                {reservation.userName}
                              </span>
                              {reservation.guestEmail ? (
                                <span className="line-clamp-1 text-[0.6rem] font-normal opacity-90 sm:text-[0.65rem]">
                                  {reservation.guestEmail}
                                </span>
                              ) : null}
                            </>
                          ) : null}
                        </span>
                      ) : (
                        <span className="flex min-w-0 flex-col items-center gap-0.5">
                          <span className="line-clamp-2 font-medium">
                            {isLoggedIn
                              ? reservation.userName
                              : t("tennis.reserved")}
                          </span>
                          {isLoggedIn && reservation.seriesId ? (
                            <span className="text-[0.6rem] font-semibold uppercase tracking-wide opacity-80">
                              {t("tennis.seriesBadge")}
                            </span>
                          ) : null}
                        </span>
                      );

                      return (
                        <td key={key} rowSpan={span} className="relative px-1 py-1.5 sm:px-2 sm:py-2">
                          {canOpenManage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setManageError(null);
                                setManage(reservation);
                              }}
                              className="absolute inset-x-1 inset-y-0.5 flex items-center justify-center rounded-md bg-amber-400/30 px-1 text-center text-[0.65rem] leading-snug text-amber-950 ring-1 ring-amber-500/40 hover:bg-amber-400/45 sm:inset-x-2 sm:inset-y-1 sm:px-2 sm:text-xs"
                            >
                              {cellLabel}
                            </button>
                          ) : (
                            <div
                              className={cn(
                                "absolute inset-x-1 inset-y-0.5 flex items-center justify-center rounded-md px-1 text-center text-[0.65rem] leading-snug ring-1 sm:inset-x-2 sm:inset-y-1 sm:px-2 sm:text-xs",
                                isGuest && !hasLabel
                                  ? "bg-sky-500/20 text-sky-950 ring-sky-500/40"
                                  : hasLabel
                                    ? "bg-violet-500/20 text-violet-950 ring-violet-500/40"
                                    : "bg-red-500/25 text-red-950 ring-red-500/40",
                              )}
                            >
                              {cellLabel}
                            </div>
                          )}
                        </td>
                      );
                    }

                    return (
                      <td key={key} className="px-1 py-1.5 sm:px-2 sm:py-2">
                        <button
                          type="button"
                          disabled={unavailable}
                          onClick={() => openBooking(court, slot)}
                          className={cn(
                            "h-9 w-full rounded-md border text-[0.65rem] transition-colors sm:h-10 sm:text-xs",
                            unavailable
                              ? "cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/50"
                              : "border-emerald-500/40 bg-emerald-500/20 text-emerald-900 hover:bg-emerald-500/30 active:bg-emerald-500/30",
                          )}
                        >
                          {court.blocked ? "Gesperrt" : "Frei"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-emerald-500/40 ring-1 ring-emerald-500/50" />
          Frei
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-amber-400/50 ring-1 ring-amber-500/50" />
          Meine Reservierung
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-sky-500/40 ring-1 ring-sky-500/50" />
          {t("tennis.guestBadge")}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-red-500/40 ring-1 ring-red-500/50" />
          Belegt
        </span>
      </div>

      {!isLoggedIn ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Reservieren ohne Konto mit Name, E-Mail und Zahlung.{" "}
          <Link href={`/anmelden?next=/tennisplatz?tag=${dayIso}`} className="underline">
            Anmelden
          </Link>{" "}
          für Saisonkarten-Inhaber (kostenlos) oder{" "}
          <Link href="/registrieren" className="underline">
            registrieren
          </Link>
          .
        </p>
      ) : hasSeasonCard ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Mit aktiver Tennis-Saisonkarte spielen Sie kostenlos.
        </p>
      ) : null}

      <Dialog open={!isMobile && pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="flex max-h-[min(90dvh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 gap-1 px-4 pt-4 pr-12">
            <DialogTitle>Platz reservieren</DialogTitle>
            <DialogDescription>
              {pending
                ? `${pending.courtName} · ${formatSlotDate(new Date(pending.startsAt))}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {bookingForm}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 rounded-none sm:gap-0">
            {bookingActions}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={isMobile && pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <SheetContent
          side="bottom"
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4"
        >
          <SheetHeader className="shrink-0 px-0 text-left">
            <SheetTitle>Platz reservieren</SheetTitle>
            <SheetDescription>
              {pending
                ? `${pending.courtName} · ${formatSlotDate(new Date(pending.startsAt))}`
                : null}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
            {bookingForm}
          </div>
          <SheetFooter className="shrink-0 grid grid-cols-2 gap-2 px-0 pt-2">
            {bookingActions}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ManageReservationPanel
        reservation={manage}
        open={manage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setManage(null);
            setManageError(null);
          }
        }}
        isMobile={isMobile}
        canManageBlocks={canManageBlocks}
        error={manageError}
        pending={pendingAction}
        onCancel={(scope) => {
          if (!manage) return;
          const paid = reservationIsPaid(manage);
          if (scope === "one" && !manage.seriesId) {
            const ok = window.confirm(
              paid && manage.priceCents > 0
                ? t("tennis.cancelConfirmCredit", {
                    amount: formatEuro(manage.priceCents),
                  })
                : t("tennis.cancelConfirm"),
            );
            if (!ok) return;
          }
          setManageError(null);
          startAction(async () => {
            const { cancelReservationAction } = await import(
              "@/app/actions/reservations"
            );
            const result = await cancelReservationAction(manage.id, scope);
            if (result && "error" in result) {
              setManageError(result.error);
              return;
            }
            if (result && "ok" in result && result.cardRefundCreditedCents) {
              window.alert(
                t("tennis.cancelCardFallback", {
                  amount: formatEuro(result.cardRefundCreditedCents),
                }),
              );
            } else if (result && "ok" in result && result.pendingRefundCents) {
              window.alert(
                t("tennis.cancelCardPending", {
                  amount: formatEuro(result.pendingRefundCents),
                }),
              );
            }
            setManage(null);
            router.refresh();
          });
        }}
      />
      <CalendarSyncOffer
        open={calendarOfferOpen}
        kind="tennis"
        onClose={() => setCalendarOfferOpen(false)}
      />
    </div>
  );
}

function ManageReservationPanel({
  reservation,
  open,
  onOpenChange,
  isMobile,
  canManageBlocks,
  error,
  pending,
  onCancel,
}: {
  reservation: ReservationCell | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  canManageBlocks: boolean;
  error: string | null;
  pending: boolean;
  onCancel: (scope: CancelReservationScope) => void;
}) {
  const { t } = useI18n();
  if (!reservation) return null;

  const paid = reservationIsPaid(reservation);
  const isGuest = Boolean(reservation.isGuest) || !reservation.userId;
  const hasSeries = Boolean(reservation.seriesId);
  const guestCancelOpen =
    !isGuest ||
    canCancelGuestReservation(new Date(reservation.startsAt));
  const canCancel = isGuest
    ? canManageBlocks && guestCancelOpen
    : canManageBlocks ||
      canCancelCourtReservation({
        ...reservation,
        status: "CONFIRMED",
      });
  const deadlineLabel = formatCancelRefundMinutes(
    reservation.cancelRefundMinutesBeforeStart,
  );

  const body = (
    <>
      {reservation.label ? (
        <p className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm font-medium">
          {reservation.label}
          {hasSeries ? ` · ${t("tennis.seriesBadge")}` : null}
        </p>
      ) : isGuest ? (
        <p className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
          <span className="font-semibold">{t("tennis.guestBadge")}</span>
          {reservation.userName ? ` · ${reservation.userName}` : null}
          {reservation.guestEmail ? (
            <>
              <br />
              <span className="text-muted-foreground">{reservation.guestEmail}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {formatSlotDate(new Date(reservation.startsAt))} ·{" "}
        {formatSlotTime(new Date(reservation.startsAt))}–
        {formatSlotTime(new Date(reservation.endsAt))} Uhr
      </p>
      {paid ? (
        <p className="text-sm text-muted-foreground">
          {formatEuro(reservation.priceCents)}
          {isGuest
            ? guestCancelOpen
              ? ` · ${t("tennis.guestCancelRefund")}`
              : ""
            : ` · ${t("tennis.refundUntil", { time: deadlineLabel })}`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("tennis.rulesSeasonCard")}
        </p>
      )}
      {isGuest && !canManageBlocks ? (
        <p className="text-sm text-muted-foreground">{t("tennis.guestNoCancel")}</p>
      ) : null}
      {isGuest && canManageBlocks && !guestCancelOpen ? (
        <p className="text-sm text-muted-foreground">
          {t("tennis.guestCancelClosed")}
        </p>
      ) : null}
      {!canCancel && paid && !isGuest ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {t("tennis.cancelDeadlineWarning", { time: deadlineLabel })}
        </p>
      ) : null}
      {canCancel && hasSeries ? (
        <p className="text-sm text-muted-foreground">
          {t("tennis.cancelSeriesQuestion")}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        {t("tennis.cancelDialog")}
      </Button>
      {canCancel && hasSeries ? (
        <>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => onCancel("one")}
          >
            {t("tennis.cancelThisOnly")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => onCancel("series")}
          >
            {t("tennis.cancelWholeSeries")}
          </Button>
        </>
      ) : canCancel ? (
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => onCancel("one")}
        >
          {t("tennis.cancelReservation")}
        </Button>
      ) : null}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <SheetHeader className="px-0 text-left">
            <SheetTitle>{t("tennis.manageReservation")}</SheetTitle>
            <SheetDescription>{reservation.courtName}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 py-2">{body}</div>
          <SheetFooter className="grid grid-cols-1 gap-2 px-0 sm:grid-cols-2">
            {actions}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tennis.manageReservation")}</DialogTitle>
          <DialogDescription>{reservation.courtName}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">{body}</div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingFormFields({
  pending,
  durationMinutes,
  setDurationMinutes,
  maxDurationHours,
  minutesUntilBlocked,
  isLoggedIn,
  canManageBlocks,
  bookerName,
  guestName,
  setGuestName,
  guestEmail,
  setGuestEmail,
  adminLabel,
  setAdminLabel,
  seriesEnabled,
  setSeriesEnabled,
  seriesWeekday,
  setSeriesWeekday,
  seriesUntilDate,
  setSeriesUntilDate,
  estimatedPriceCents,
  creditBalanceCents,
  creditApplied,
  amountDue,
  useCredit,
  setUseCredit,
  error,
}: {
  pending: PendingSlot;
  durationMinutes: number;
  setDurationMinutes: (value: number) => void;
  maxDurationHours: number;
  minutesUntilBlocked: (courtId: string, startsAt: Date) => number;
  isLoggedIn: boolean;
  canManageBlocks: boolean;
  bookerName: string | null;
  guestName: string;
  setGuestName: (value: string) => void;
  guestEmail: string;
  setGuestEmail: (value: string) => void;
  adminLabel: string;
  setAdminLabel: (value: string) => void;
  seriesEnabled: boolean;
  setSeriesEnabled: (value: boolean) => void;
  seriesWeekday: number;
  setSeriesWeekday: (value: number) => void;
  seriesUntilDate: string;
  setSeriesUntilDate: (value: string) => void;
  estimatedPriceCents: number;
  creditBalanceCents: number;
  creditApplied: number;
  amountDue: number;
  useCredit: boolean;
  setUseCredit: (value: boolean) => void;
  error: string | null;
}) {
  const { t } = useI18n();
  const seriesMinDate = toDateParam(
    addDays(new Date(pending.startsAt), 1),
  );

  return (
    <>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="duration">Spieldauer</Label>
          <select
            id="duration"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="h-11 rounded-lg border border-input bg-transparent px-3 text-base"
          >
            {durationOptions(maxDurationHours)
              .filter(
                (option) =>
                  option.minutes <=
                  minutesUntilBlocked(pending.courtId, new Date(pending.startsAt)),
              )
              .map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground">
            von {formatSlotTime(new Date(pending.startsAt))} Uhr bis{" "}
            {formatSlotTime(
              slotEnd(new Date(pending.startsAt), durationMinutes),
            )}{" "}
            Uhr
          </p>
          <p className="text-xs text-muted-foreground">
            {maxDurationHours > BOOKING.maxHoursPerBooking
              ? "Als Admin oder Tennis-Sektions-Admin können Sie länger als 2 Stunden buchen."
              : `Maximal ${BOOKING.maxHoursPerBooking} Stunden pro Reservierung.`}
          </p>
        </div>

        {isLoggedIn ? (
          <div className="grid gap-2">
            <Label>Ihr Name</Label>
            <Input value={bookerName ?? ""} readOnly disabled className="h-11" />
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="guestName">Ihr Name</Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                autoComplete="name"
                required
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="guestEmail">E-Mail</Label>
              <Input
                id="guestEmail"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-11"
              />
            </div>
          </>
        )}

        {canManageBlocks ? (
          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="grid gap-2">
              <Label htmlFor="adminLabel">{t("tennis.adminLabel")}</Label>
              <Input
                id="adminLabel"
                value={adminLabel}
                onChange={(e) => setAdminLabel(e.target.value)}
                placeholder={t("tennis.adminLabelPlaceholder")}
                maxLength={80}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {t("tennis.adminLabelHint")}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={seriesEnabled}
                onChange={(event) => setSeriesEnabled(event.target.checked)}
                className="mt-1 size-4 accent-primary"
              />
              <span>{t("tennis.seriesToggle")}</span>
            </label>
            {seriesEnabled ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="seriesWeekday">{t("tennis.seriesWeekday")}</Label>
                  <select
                    id="seriesWeekday"
                    value={seriesWeekday}
                    onChange={(e) => setSeriesWeekday(Number(e.target.value))}
                    className="h-11 rounded-lg border border-input bg-transparent px-3 text-base"
                  >
                    {([1, 2, 3, 4, 5, 6, 7] as const).map((day) => (
                      <option key={day} value={day}>
                        {t(`tennis.weekday${day}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="seriesUntil">{t("tennis.seriesUntil")}</Label>
                  <Input
                    id="seriesUntil"
                    type="date"
                    min={seriesMinDate}
                    value={seriesUntilDate}
                    onChange={(e) => setSeriesUntilDate(e.target.value)}
                    required={seriesEnabled}
                    className="h-11"
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {t("tennis.seriesHint")}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
          {estimatedPriceCents === 0 ? (
            <span>Kostenlos</span>
          ) : creditApplied > 0 ? (
            <span>
              Summe {formatEuro(estimatedPriceCents)} · Guthaben −
              {formatEuro(creditApplied)} · zu zahlen {formatEuro(amountDue)}
            </span>
          ) : (
            <span>Zu zahlen: {formatEuro(estimatedPriceCents)}</span>
          )}
        </p>

        {isLoggedIn && estimatedPriceCents > 0 && availableCreditCents > 0 ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCredit}
              onChange={(event) => setUseCredit(event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              Guthaben verwenden ({formatEuro(availableCreditCents)}{" "}
              verfügbar)
            </span>
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function ReservationRules({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
      <h3 className="font-heading text-lg text-primary">Regeln</h3>
      <ul className={cn("mt-3 grid gap-2 text-muted-foreground", compact && "text-xs")}>
        <li>· ½-Stunden-Takt, Dauer beim Buchen wählbar</li>
        <li>· Preis pro Stunde je nach Platz (siehe Kalender)</li>
        <li>· Tennis-Saisonkarte: kostenlos (angemeldet)</li>
        <li>· Gäste: nur Kartenzahlung. Löschbar bis zum Vortag, Rückerstattung abzüglich Transaktionskosten. Am Tag der Reservierung nicht mehr.</li>
        <li>· Max. {BOOKING.maxHoursPerBooking} Stunden pro Reservierung (Admins länger)</li>
        <li>· Bezahlte Reservierungen: Stornierung nur bis zur eingestellten Frist vor Beginn (je Platz). Rückerstattung abzüglich Transaktionskosten.</li>
        <li>
          · Kostenlose Buchungen (Saisonkarte/Mitgliedschaft): jederzeit
          stornierbar
        </li>
      </ul>
    </div>
  );
}

export function MyReservationsList({
  reservations,
}: {
  reservations: Array<{
    id: string;
    courtName: string;
    category: string;
    label?: string | null;
    seriesId?: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
    priceCents: number;
    paidAt: string | null;
    cancelRefundMinutesBeforeStart: number;
  }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useI18n();
  const now = new Date();

  function runCancel(itemId: string, scope: CancelReservationScope) {
    setError(null);
    start(async () => {
      const { cancelReservationAction } = await import(
        "@/app/actions/reservations"
      );
      const result = await cancelReservationAction(itemId, scope);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (result && "ok" in result && result.cardRefundCreditedCents) {
        window.alert(
          t("tennis.cancelCardFallback", {
            amount: formatEuro(result.cardRefundCreditedCents),
          }),
        );
      } else if (result && "ok" in result && result.pendingRefundCents) {
        window.alert(
          t("tennis.cancelCardPending", {
            amount: formatEuro(result.pendingRefundCents),
          }),
        );
      }
      router.refresh();
    });
  }

  if (reservations.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-muted-foreground">
        {t("tennis.myEmpty")}{" "}
        <Link href="/tennisplatz" className="underline">
          {t("common.bookCourt")}
        </Link>
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {reservations.map((item) => {
        const startsAt = new Date(item.startsAt);
        const paid = reservationIsPaid(item);
        const canCancel = canCancelCourtReservation(item, now);
        const hasSeries = Boolean(item.seriesId);
        const deadlineLabel = formatCancelRefundMinutes(
          item.cancelRefundMinutesBeforeStart,
        );

        return (
        <li
          key={item.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">
              {item.courtName} · {item.category}
              {item.label ? ` · ${item.label}` : null}
              {hasSeries ? ` · ${t("tennis.seriesBadge")}` : null}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatSlotDate(startsAt)} ·{" "}
              {formatSlotTime(startsAt)}–
              {formatSlotTime(new Date(item.endsAt))} Uhr
            </p>
            {paid ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatEuro(item.priceCents)} ·{" "}
                {t("tennis.refundUntil", { time: deadlineLabel })}
              </p>
            ) : null}
            {item.status === "CONFIRMED" && !canCancel && paid ? (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                {t("tennis.cancelDeadlineWarning", { time: deadlineLabel })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge variant={item.status === "CONFIRMED" ? "default" : "secondary"}>
              {item.status === "CONFIRMED"
                ? t("tennis.statusConfirmed")
                : t("tennis.statusCancelled")}
            </Badge>
            {item.status === "CONFIRMED" && canCancel && hasSeries ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={pending}
                  onClick={() => runCancel(item.id, "one")}
                >
                  {t("tennis.cancelThisOnly")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={pending}
                  onClick={() => runCancel(item.id, "series")}
                >
                  {t("tennis.cancelWholeSeries")}
                </Button>
              </>
            ) : item.status === "CONFIRMED" && canCancel ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 w-full sm:w-auto"
                disabled={pending}
                onClick={() => {
                  const ok = window.confirm(
                    paid && item.priceCents > 0
                      ? t("tennis.cancelConfirmCredit", {
                          amount: formatEuro(item.priceCents),
                        })
                      : t("tennis.cancelConfirm"),
                  );
                  if (!ok) return;
                  runCancel(item.id, "one");
                }}
              >
                {t("tennis.cancelReservation")}
              </Button>
            ) : item.status === "CONFIRMED" && paid ? (
              <span className="text-xs text-muted-foreground">
                {t("tennis.cancelDeadlinePassed")}
              </span>
            ) : null}
          </div>
        </li>
        );
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </ul>
  );
}
