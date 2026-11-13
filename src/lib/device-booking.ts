import { BOOKING, reservationHours, startOfDay, endOfDay } from "@/lib/booking";

export type DevicePricingMode = "HOURLY" | "DAILY";

/** Geschäftszeiten für Tagesanteil bei Stundenbuchung mit Tagespreis */
export const DEVICE_DAY_HOURS = BOOKING.closeHour - BOOKING.openHour;

export function deviceBookingPriceCents(
  device: { pricingMode: DevicePricingMode; priceCents: number },
  startsAt: Date,
  endsAt: Date,
  billingMode: DevicePricingMode,
): number {
  if (billingMode === "DAILY") {
    const days = Math.max(
      1,
      Math.ceil((endOfDay(endsAt).getTime() - startOfDay(startsAt).getTime()) / 86_400_000),
    );
    if (device.pricingMode === "DAILY") {
      return device.priceCents * days;
    }
    return Math.round(device.priceCents * DEVICE_DAY_HOURS * days);
  }

  const hours = Math.max(reservationHours(startsAt, endsAt), BOOKING.slotMinutes / 60);
  if (device.pricingMode === "HOURLY") {
    return Math.round(device.priceCents * hours);
  }
  // Tagespreis 0 → auch stundenweise kostenlos; sonst mind. 1 Cent (Aufrundung).
  if (device.priceCents <= 0) return 0;
  return Math.max(
    1,
    Math.ceil((hours / DEVICE_DAY_HOURS) * device.priceCents),
  );
}

/**
 * Ganztagsbuchung bleibt am selben Tag möglich, solange das Tagesende
 * noch nicht erreicht ist. Liegt der Öffnungsbeginn schon zurück,
 * beginnt die Reservierung zum aktuellen Zeitpunkt.
 */
export function resolveDailyBookingWindow(
  start: Date,
  end: Date,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  if (end <= now) return null;
  const effectiveStart = start.getTime() < now.getTime() ? new Date(now) : start;
  if (effectiveStart >= end) return null;
  return { start: effectiveStart, end };
}

export function formatDevicePriceLabel(device: {
  pricingMode: DevicePricingMode;
  priceCents: number;
}) {
  const euros = (device.priceCents / 100).toFixed(2).replace(".", ",");
  return device.pricingMode === "DAILY" ? `${euros} € / Tag` : `${euros} € / Std.`;
}
