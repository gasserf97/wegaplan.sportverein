"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createDeviceReservationAction,
  cancelDeviceReservationAction,
} from "@/app/actions/devices";
import { rememberDevicePendingCheckout } from "@/components/court-checkout-cleanup";
import {
  BOOKING,
  addDays,
  buildDaySlots,
  formatSlotDate,
  formatSlotTime,
  formatSlotWeekdayShort,
  formatWeekRange,
  slotEnd,
  startOfWeekMonday,
  toDateParam,
} from "@/lib/booking";
import {
  deviceBookingPriceCents,
  formatDevicePriceLabel,
  resolveDailyBookingWindow,
  type DevicePricingMode,
} from "@/lib/device-booking";
import { formatEuro } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useI18n } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

type Device = {
  id: string;
  name: string;
  category: string;
  blocked: boolean;
  pricingMode: DevicePricingMode;
  priceCents: number;
};

type Reservation = {
  id: string;
  deviceId: string;
  userId: string;
  userName: string;
  startsAt: string;
  endsAt: string;
  billingMode: DevicePricingMode;
  reason: string;
};

type ManageReservation = Reservation & { deviceName: string };

function reservationTimeLabel(reservation: Reservation) {
  return `${formatSlotTime(new Date(reservation.startsAt))}–${formatSlotTime(new Date(reservation.endsAt))} Uhr`;
}

function dayBookingBounds(day: Date) {
  const start = new Date(day);
  start.setHours(BOOKING.openHour, 0, 0, 0);
  const end = new Date(day);
  end.setHours(BOOKING.closeHour, 0, 0, 0);
  return { start, end };
}

function parseIsoDay(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

type PendingBooking = {
  device: Device;
  start: Date;
  end: Date;
  billingMode: DevicePricingMode;
};

export function DeviceBookingCalendar({
  weekStartIso,
  dayIso,
  devices,
  reservations,
  currentUserId,
  canBook = true,
  canBookReason = null,
  lastReason = "",
  creditBalanceCents = 0,
}: {
  weekStartIso: string;
  dayIso: string;
  devices: Device[];
  reservations: Reservation[];
  currentUserId: string;
  canBook?: boolean;
  canBookReason?: string | null;
  lastReason?: string;
  creditBalanceCents?: number;
}) {
  void creditBalanceCents;
  const { t } = useI18n();
  const router = useRouter();
  const weekStart = useMemo(
    () => new Date(`${weekStartIso}T12:00:00`),
    [weekStartIso],
  );
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        addDays(startOfWeekMonday(weekStart), i),
      ),
    [weekStart],
  );
  const day = useMemo(() => new Date(`${dayIso}T12:00:00`), [dayIso]);
  const now = useMemo(() => new Date(), []);
  const slots = useMemo(() => {
    const all = buildDaySlots(day);
    if (dayIso !== toDateParam(now)) return all;
    return all.filter((slot) => slotEnd(slot) > now);
  }, [day, dayIso, now]);

  const [billingMode, setBillingMode] = useState<DevicePricingMode>("DAILY");
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();
  const [confirm, setConfirm] = useState<PendingBooking | null>(null);
  const [confirmReason, setConfirmReason] = useState(lastReason);
  const [manage, setManage] = useState<ManageReservation | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (confirm) setConfirmReason(lastReason);
  }, [confirm, lastReason]);

  const prevWeek = toDateParam(addDays(weekStart, -7));
  const nextWeek = toDateParam(addDays(weekStart, 7));
  const thisWeek = toDateParam(startOfWeekMonday(new Date()));
  const today = toDateParam(new Date());
  const prevDay = toDateParam(addDays(day, -1));
  const nextDay = toDateParam(addDays(day, 1));

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function reservationOnSlot(deviceId: string, slot: Date) {
    const finish = slotEnd(slot);
    return (
      reservations.find(
        (r) =>
          r.deviceId === deviceId &&
          new Date(r.startsAt) < finish &&
          new Date(r.endsAt) > slot,
      ) ?? null
    );
  }

  function bookDeniedMessage() {
    return (
      canBookReason ??
      "Fahrzeugreservierung ist nur mit Freigabe durch die Verwaltung möglich."
    );
  }

  function bookDay(device: Device, forDay: Date) {
    if (!canBook) {
      setError(bookDeniedMessage());
      return;
    }
    const { start, end } = dayBookingBounds(forDay);
    const bookingWindow = resolveDailyBookingWindow(start, end);
    if (!bookingWindow) {
      setError("Dieser Tag ist bereits vorbei.");
      return;
    }
    setError(null);
    setConfirmReason(lastReason);
    setConfirm({
      device,
      start: bookingWindow.start,
      end: bookingWindow.end,
      billingMode: "DAILY",
    });
  }

  function bookSlot(device: Device, slot: Date) {
    if (!canBook) {
      setError(bookDeniedMessage());
      return;
    }
    setError(null);
    setConfirmReason(lastReason);
    setConfirm({
      device,
      start: slot,
      end: slotEnd(slot),
      billingMode: "HOURLY",
    });
  }

  function submitBooking(booking: PendingBooking, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t("autos.reasonRequired"));
      return;
    }
    setConfirm(null);
    setError(null);
    startAction(async () => {
      const result = await createDeviceReservationAction(
        booking.device.id,
        booking.start.toISOString(),
        booking.end.toISOString(),
        booking.billingMode,
        trimmed,
        false,
      );
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (result && "paymentUrl" in result) {
        if ("reservationId" in result && result.reservationId) {
          rememberDevicePendingCheckout(result.reservationId);
        }
        window.location.href = result.paymentUrl;
        return;
      }
      router.refresh();
    });
  }

  function dayReservationsFor(deviceId: string, start: Date, end: Date) {
    return reservations.filter(
      (r) =>
        r.deviceId === deviceId &&
        new Date(r.startsAt) < end &&
        new Date(r.endsAt) > start,
    );
  }

  function pushWeek(iso: string) {
    router.push(`/autos?woche=${iso}&tag=${dayIso}`);
  }

  function pushDay(iso: string) {
    const week = toDateParam(startOfWeekMonday(parseIsoDay(iso)));
    router.push(`/autos?woche=${week}&tag=${iso}`);
  }

  function openManage(reservation: Reservation, deviceName: string) {
    setManageError(null);
    setManage({ ...reservation, deviceName });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl text-primary capitalize">
            {billingMode === "DAILY"
              ? formatWeekRange(weekStart)
              : formatSlotDate(day)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Alle Fahrzeuge · ganztägig oder nach Uhrzeit
          </p>
        </div>
        {billingMode === "DAILY" ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-label="Vorherige Woche"
                disabled={weekStartIso <= thisWeek}
                onClick={() => pushWeek(prevWeek)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                onClick={() => pushWeek(thisWeek)}
              >
                Diese Woche
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-label="Nächste Woche"
                onClick={() => pushWeek(nextWeek)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-input px-2.5 text-sm">
              <span className="sr-only">Datum</span>
              <input
                type="date"
                value={dayIso}
                min={today}
                onChange={(e) => {
                  if (e.target.value) pushDay(e.target.value);
                }}
                className="min-h-9 bg-transparent outline-none"
              />
            </label>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-label="Vorheriger Tag"
                disabled={dayIso <= today}
                onClick={() => pushDay(prevDay)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                onClick={() => pushDay(today)}
              >
                Heute
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-label="Nächster Tag"
                onClick={() => pushDay(nextDay)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-input px-2.5 text-sm">
              <span className="sr-only">Datum</span>
              <input
                type="date"
                value={dayIso}
                min={today}
                onChange={(e) => {
                  if (e.target.value) pushDay(e.target.value);
                }}
                className="min-h-9 bg-transparent outline-none"
              />
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2">
        <button
          type="button"
          onClick={() => setBillingMode("DAILY")}
          className={cn(
            "min-h-11 rounded-lg text-sm font-medium transition-colors",
            billingMode === "DAILY"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Ganzer Tag
        </button>
        <button
          type="button"
          onClick={() => setBillingMode("HOURLY")}
          className={cn(
            "min-h-11 rounded-lg text-sm font-medium transition-colors",
            billingMode === "HOURLY"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Nach Uhrzeit
        </button>
      </div>

      {!canBook && canBookReason ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {canBookReason}
        </p>
      ) : null}

      {devices.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
          Derzeit sind keine Fahrzeuge freigeschaltet.
        </p>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => (
            <section
              key={device.id}
              className="space-y-3 rounded-xl border border-border bg-card p-4"
            >
              <div>
                <p className="font-medium">{device.name}</p>
                <p className="text-xs text-muted-foreground">
                  {device.category} · {formatDevicePriceLabel(device)}
                  {device.blocked ? " · gesperrt" : null}
                </p>
              </div>

              {billingMode === "DAILY" ? (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                  {weekDays.map((weekDay) => {
                    const { start, end } = dayBookingBounds(weekDay);
                    const dayKey = toDateParam(weekDay);
                    const past = resolveDailyBookingWindow(start, end, now) === null;
                    const dayItems = dayReservationsFor(device.id, start, end);
                    const busy = dayItems.length > 0 || device.blocked;
                    const own =
                      dayItems.find((r) => r.userId === currentUserId) ?? null;
                    const shown = own ?? dayItems[0] ?? null;
                    const price = deviceBookingPriceCents(
                      device,
                      start,
                      end,
                      "DAILY",
                    );
                    const bookable =
                      canBook && !busy && !device.blocked && !past;
                    if (shown && !device.blocked) {
                      const isOwn = shown.userId === currentUserId;
                      const content = (
                        <>
                          <p className="text-sm font-medium">
                            {formatSlotWeekdayShort(weekDay)}
                          </p>
                          <p className="mt-1 text-xs font-medium">
                            {isOwn ? t("autos.yourReservation") : shown.userName}
                          </p>
                          <p className="mt-0.5 text-xs opacity-80 tabular-nums">
                            {reservationTimeLabel(shown)}
                            {shown.billingMode === "DAILY" ? " · Tag" : null}
                          </p>
                          {shown.reason ? (
                            <p className="mt-1 line-clamp-3 text-xs opacity-90">
                              {shown.reason}
                            </p>
                          ) : null}
                          {dayItems.length > 1 ? (
                            <p className="mt-1 text-xs opacity-70">
                              +{dayItems.length - 1} weitere
                            </p>
                          ) : null}
                          {isOwn ? (
                            <span className="mt-3 text-sm font-medium">
                              Öffnen
                            </span>
                          ) : null}
                        </>
                      );
                      if (isOwn) {
                        return (
                          <li key={dayKey}>
                            <button
                              type="button"
                              onClick={() => openManage(shown, device.name)}
                              className="flex min-h-full w-full flex-col rounded-xl border border-amber-500/40 bg-amber-400/25 px-3 py-3 text-left hover:bg-amber-400/40"
                            >
                              {content}
                            </button>
                          </li>
                        );
                      }
                      return (
                        <li
                          key={dayKey}
                          className="flex flex-col rounded-xl border border-red-500/40 bg-red-500/20 px-3 py-3"
                        >
                          {content}
                        </li>
                      );
                    }
                    return (
                      <li
                        key={dayKey}
                        className={cn(
                          "flex flex-col rounded-xl border px-3 py-3",
                          busy || past
                            ? "border-border bg-muted/40"
                            : "border-emerald-500/40 bg-emerald-500/20",
                        )}
                      >
                        <p className="text-sm font-medium">
                          {formatSlotWeekdayShort(weekDay)}
                        </p>
                        <p className="mt-1 text-xs opacity-80">
                          {device.blocked
                            ? "Gesperrt"
                            : past
                              ? "Vergangen"
                              : formatEuro(price)}
                        </p>
                        {bookable ? (
                          <Button
                            className="mt-3 min-h-10"
                            size="sm"
                            disabled={pending}
                            onClick={() => bookDay(device, weekDay)}
                          >
                            {pending ? "…" : "Reservieren"}
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="grid gap-2">
                  {slots.length === 0 ? (
                    <li className="rounded-xl bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                      Für diesen Tag keine weiteren Zeiten.
                    </li>
                  ) : null}
                  {slots.map((slot) => {
                    const reservation = reservationOnSlot(device.id, slot);
                    const unavailable = device.blocked || !canBook;
                    if (reservation) {
                      const isOwn = reservation.userId === currentUserId;
                      const isStart =
                        new Date(reservation.startsAt).getTime() ===
                          slot.getTime() ||
                        slots.find(
                          (s) =>
                            new Date(reservation.startsAt) < slotEnd(s) &&
                            new Date(reservation.endsAt) > s,
                        )?.getTime() === slot.getTime();
                      if (!isStart) return null;
                      const details = (
                        <>
                          <p className="font-medium tabular-nums">
                            {reservationTimeLabel(reservation)}
                          </p>
                          <p className="text-sm font-medium">
                            {isOwn
                              ? t("autos.yourReservation")
                              : reservation.userName}
                          </p>
                          {reservation.reason ? (
                            <p className="mt-1 text-sm opacity-90">
                              {reservation.reason}
                            </p>
                          ) : null}
                        </>
                      );
                      if (isOwn) {
                        return (
                          <li key={slot.toISOString()}>
                            <button
                              type="button"
                              onClick={() =>
                                openManage(reservation, device.name)
                              }
                              className="w-full rounded-xl border border-amber-500/40 bg-amber-400/25 px-4 py-3 text-left hover:bg-amber-400/40"
                            >
                              {details}
                            </button>
                          </li>
                        );
                      }
                      return (
                        <li
                          key={slot.toISOString()}
                          className="rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-3"
                        >
                          {details}
                        </li>
                      );
                    }
                    const price = deviceBookingPriceCents(
                      device,
                      slot,
                      slotEnd(slot),
                      "HOURLY",
                    );
                    return (
                      <li key={slot.toISOString()}>
                        <button
                          type="button"
                          disabled={unavailable || pending}
                          onClick={() => bookSlot(device, slot)}
                          className={cn(
                            "flex min-h-14 w-full items-center justify-between rounded-xl border px-4 py-3 text-sm",
                            unavailable
                              ? "cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/50"
                              : "border-emerald-500/40 bg-emerald-500/20 text-emerald-900",
                          )}
                        >
                          <span className="font-medium tabular-nums">
                            {formatSlotTime(slot)} Uhr
                          </span>
                          <span className="font-medium">
                            {unavailable
                              ? device.blocked
                                ? "Gesperrt"
                                : "Keine Freigabe"
                              : `Reservieren · ${formatEuro(price)}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("autos.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {confirm
                ? confirm.billingMode === "DAILY"
                  ? t("autos.confirmBodyDay", {
                      vehicle: confirm.device.name,
                      date: formatSlotDate(confirm.start),
                    })
                  : t("autos.confirmBodyHour", {
                      vehicle: confirm.device.name,
                      date: formatSlotDate(confirm.start),
                      start: formatSlotTime(confirm.start),
                      end: formatSlotTime(confirm.end),
                    })
                : null}
            </DialogDescription>
          </DialogHeader>
          {confirm ? (
            <div className="grid gap-3">
              <p className="text-sm font-medium">
                {formatEuro(
                  deviceBookingPriceCents(
                    confirm.device,
                    confirm.start,
                    confirm.end,
                    confirm.billingMode,
                  ),
                )}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="device-reason" required>
                  {t("autos.reasonLabel")}
                </Label>
                <Textarea
                  id="device-reason"
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder={t("autos.reasonPlaceholder")}
                  maxLength={200}
                  rows={3}
                  autoFocus
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={pending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || !confirm || !confirmReason.trim()}
              onClick={() => {
                if (confirm) submitBooking(confirm, confirmReason);
              }}
            >
              {pending ? "…" : t("autos.confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageDeviceReservationPanel
        reservation={manage}
        open={manage !== null}
        onOpenChange={(open) => {
          if (!open) {
            setManage(null);
            setManageError(null);
          }
        }}
        isMobile={isMobile}
        error={manageError}
        pending={pending}
        onCancel={() => {
          if (!manage) return;
          const ok = window.confirm(t("autos.cancelConfirm"));
          if (!ok) return;
          setManageError(null);
          startAction(async () => {
            const result = await cancelDeviceReservationAction(manage.id);
            if (result && "error" in result) {
              setManageError(result.error);
              return;
            }
            setManage(null);
            router.refresh();
          });
        }}
      />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-emerald-500/40" /> Frei
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-amber-400/50" /> Meine
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-red-500/40" /> Belegt (Name, Zeit,
          Grund)
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-muted-foreground/30" /> Gesperrt
        </span>
      </div>
    </div>
  );
}

function ManageDeviceReservationPanel({
  reservation,
  open,
  onOpenChange,
  isMobile,
  error,
  pending,
  onCancel,
}: {
  reservation: ManageReservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  error: string | null;
  pending: boolean;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (!reservation) return null;

  const body = (
    <>
      <p className="text-sm text-muted-foreground">
        {formatSlotDate(new Date(reservation.startsAt))} ·{" "}
        {reservationTimeLabel(reservation)}
        {reservation.billingMode === "DAILY" ? " · ganzer Tag" : null}
      </p>
      {reservation.reason ? (
        <p className="text-sm">
          <span className="font-medium">{t("autos.reasonLabel")}: </span>
          {reservation.reason}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        {t("common.cancel")}
      </Button>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={onCancel}
      >
        {t("autos.cancelReservation")}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle>{t("autos.manageReservation")}</SheetTitle>
            <SheetDescription>{reservation.deviceName}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 py-2">{body}</div>
          <SheetFooter className="grid grid-cols-2 gap-2 px-0">{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("autos.manageReservation")}</DialogTitle>
          <DialogDescription>{reservation.deviceName}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">{body}</div>
        <DialogFooter className="gap-2 sm:gap-0">{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MyDeviceReservationsList({
  reservations,
}: {
  reservations: Array<{
    id: string;
    deviceName: string;
    startsAt: string;
    endsAt: string;
    billingMode: DevicePricingMode;
    priceCents: number;
    status: string;
    reason?: string;
  }>;
}) {
  const [pending, startAction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (reservations.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-muted-foreground">
        Keine anstehenden Auto-Reservierungen.{" "}
        <Link href="/autos" className="underline">
          Reservieren
        </Link>
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {reservations.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">{item.deviceName}</p>
            <p className="text-sm text-muted-foreground">
              {formatSlotDate(new Date(item.startsAt))} ·{" "}
              {formatSlotTime(new Date(item.startsAt))}–
              {formatSlotTime(new Date(item.endsAt))} ·{" "}
              {item.billingMode === "DAILY" ? "Tag" : "Stunden"} ·{" "}
              {formatEuro(item.priceCents)}
            </p>
            {item.reason ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {item.reason}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge variant={item.status === "CONFIRMED" ? "default" : "secondary"}>
              {item.status === "CONFIRMED"
                ? "Bestätigt"
                : item.status === "PENDING"
                  ? "Zahlung ausstehend"
                  : item.status === "CANCELLED"
                    ? "Storniert"
                    : item.status}
            </Badge>
            {item.status === "CONFIRMED" ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startAction(async () => {
                    const result = await cancelDeviceReservationAction(item.id);
                    if (result && "error" in result) setError(result.error);
                    else router.refresh();
                  });
                }}
              >
                Stornieren
              </Button>
            ) : null}
          </div>
        </li>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </ul>
  );
}
