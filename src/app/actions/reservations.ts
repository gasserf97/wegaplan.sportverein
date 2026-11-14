"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import {
  BOOKING,
  reservationHours,
  slotEnd,
} from "@/lib/booking";
import {
  buildCourtSeriesOccurrences,
  canCancelGuestReservation,
  canCancelPaidCourtReservation,
  courtBookingPriceCents,
  courtCheckoutHoldSince,
  courtReservationIsPaid,
  isoWeekday,
  parseSeriesUntilDate,
} from "@/lib/court-booking";
import { refundPaidCourtReservation } from "@/lib/court-refund";
import { describeCardRefundError } from "@/lib/stripe-refund";
import { getSpendableCourtCreditCents } from "@/lib/pending-refund";
import { courtBookingIsFree } from "@/lib/membership";
import { emailSchema } from "@/lib/profile";
import { canBookLongTennisSlots } from "@/lib/permissions";
import { beginCourtReservationCheckout, expireStalePendingCourtReservations } from "@/app/actions/court-checkout";

export type CourtAdminBookingOptions = {
  label?: string;
  seriesEnabled?: boolean;
  seriesWeekday?: number;
  seriesUntilDate?: string;
};

export type CancelReservationScope = "one" | "series";

export type ReservationActionState =
  | { error: string }
  | {
      ok: true;
      creditedCents?: number;
      cardRefundCreditedCents?: number;
      pendingRefundCents?: number;
    }
  | { paymentUrl: string; reservationId: string }
  | null;

export type CourtFormState =
  | {
      error: string;
      fields?: {
        name: string;
        category: string;
        priceEuro: string;
        sectionId: string;
      };
    }
  | { ok: true }
  | null;

function revalidateBookingPaths() {
  revalidatePath("/tennisplatz");
  revalidatePath("/tennisplatz/meine");
  revalidatePath("/konto");
  revalidatePath("/admin/tennisplaetze");
  revalidatePath("/admin/buchhaltung");
  revalidatePath("/", "layout");
}

function parseRequiredSectionId(raw: FormDataEntryValue | null) {
  const sectionId = String(raw ?? "").trim();
  return sectionId.length > 0 ? sectionId : null;
}

async function validateSectionId(sectionId: string | null) {
  if (!sectionId) return "Bitte eine Sektion wählen.";
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) return "Sektion nicht gefunden.";
  return null;
}

function validateBookingRules(
  startsAt: Date,
  endsAt: Date,
  bypassLimit: boolean,
  now = new Date(),
) {
  if (startsAt < now) {
    return "Vergangene Zeiten können nicht reserviert werden.";
  }

  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes < BOOKING.slotMinutes || minutes % BOOKING.slotMinutes !== 0) {
    return `Bitte eine Dauer in ${BOOKING.slotMinutes}-Minuten-Schritten wählen.`;
  }

  const closing = new Date(startsAt);
  closing.setHours(BOOKING.closeHour, 0, 0, 0);
  if (endsAt > closing) {
    return `Reservierungen enden spätestens um ${BOOKING.closeHour}:00 Uhr.`;
  }

  const hours = reservationHours(startsAt, endsAt);
  if (!bypassLimit && hours > BOOKING.maxHoursPerBooking) {
    return `Maximal ${BOOKING.maxHoursPerBooking} Stunden pro Buchung.`;
  }

  return null;
}

function validateGuestBookingRules(startsAt: Date, endsAt: Date, now = new Date()) {
  if (startsAt < now) {
    return "Vergangene Zeiten können nicht reserviert werden.";
  }

  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes < BOOKING.slotMinutes || minutes % BOOKING.slotMinutes !== 0) {
    return `Bitte eine Dauer in ${BOOKING.slotMinutes}-Minuten-Schritten wählen.`;
  }

  const closing = new Date(startsAt);
  closing.setHours(BOOKING.closeHour, 0, 0, 0);
  if (endsAt > closing) {
    return `Reservierungen enden spätestens um ${BOOKING.closeHour}:00 Uhr.`;
  }

  const hours = reservationHours(startsAt, endsAt);
  if (hours > BOOKING.maxHoursPerBooking) {
    return `Maximal ${BOOKING.maxHoursPerBooking} Stunden pro Buchung.`;
  }

  return null;
}

async function findSlotOverlap(courtId: string, startsAt: Date, endsAt: Date) {
  const holdSince = courtCheckoutHoldSince();
  return prisma.courtReservation.findFirst({
    where: {
      courtId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING", createdAt: { gte: holdSince } },
      ],
    },
  });
}

async function expireStalePendingReservations() {
  await expireStalePendingCourtReservations();
}

async function findSeriesOverlaps(
  courtId: string,
  occurrences: Array<{ startsAt: Date; endsAt: Date }>,
) {
  for (const occurrence of occurrences) {
    const overlap = await findSlotOverlap(
      courtId,
      occurrence.startsAt,
      occurrence.endsAt,
    );
    if (overlap) return overlap;
  }
  return null;
}

export async function createReservationAction(
  courtId: string,
  startsAtIso: string,
  durationMinutes: number,
  guestName?: string,
  guestEmail?: string,
  useCredit = false,
  adminOptions?: CourtAdminBookingOptions,
): Promise<ReservationActionState> {
  await expireStalePendingReservations();

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return { error: "Ungültige Uhrzeit." };
  }

  const duration = Number(durationMinutes);
  if (
    !Number.isFinite(duration) ||
    duration < BOOKING.slotMinutes ||
    duration % BOOKING.slotMinutes !== 0
  ) {
    return { error: "Bitte eine gültige Spieldauer wählen." };
  }

  const court = await prisma.court.findUnique({ where: { id: courtId } });
  if (!court || !court.active) {
    return { error: "Dieser Platz ist nicht verfügbar." };
  }
  if (court.blocked) {
    return { error: "Dieser Platz ist gesperrt." };
  }

  const endsAt = slotEnd(startsAt, duration);
  const user = await getCurrentUser();
  const trimmedGuestName = guestName?.trim() ?? "";
  const trimmedGuestEmail = guestEmail?.trim() ?? "";
  const label = adminOptions?.label?.trim() || null;
  if (label && label.length > 80) {
    return { error: "Kommentar höchstens 80 Zeichen." };
  }

  if (!user) {
    if (trimmedGuestName.length < 2) {
      return { error: "Bitte Ihren Namen angeben." };
    }
    const emailParsed = emailSchema.safeParse(trimmedGuestEmail);
    if (!emailParsed.success) {
      return {
        error:
          emailParsed.error.issues[0]?.message ??
          "Bitte eine gültige E-Mail-Adresse angeben.",
      };
    }

    const ruleError = validateGuestBookingRules(startsAt, endsAt);
    if (ruleError) return { error: ruleError };

    const overlap = await findSlotOverlap(courtId, startsAt, endsAt);
    if (overlap) {
      return { error: "Dieser Zeitraum ist bereits belegt." };
    }

    const priceCents = courtBookingPriceCents(court.priceCentsPerHour, startsAt, endsAt);
    if (priceCents <= 0) {
      await prisma.courtReservation.create({
        data: {
          courtId,
          guestName: trimmedGuestName,
          guestEmail: emailParsed.data,
          startsAt,
          endsAt,
          priceCents: 0,
          paidAt: new Date(),
          status: "CONFIRMED",
        },
      });
      revalidateBookingPaths();
      return { ok: true };
    }

    const reservation = await prisma.courtReservation.create({
      data: {
        courtId,
        guestName: trimmedGuestName,
        guestEmail: emailParsed.data,
        startsAt,
        endsAt,
        priceCents,
        status: "PENDING",
      },
    });

    const checkout = await beginCourtReservationCheckout(reservation.id);
    if ("error" in checkout) {
      await prisma.courtReservation.update({
        where: { id: reservation.id },
        data: { status: "CANCELLED" },
      });
      return { error: checkout.error ?? "Zahlung konnte nicht gestartet werden." };
    }

    revalidateBookingPaths();
    return { paymentUrl: checkout.url, reservationId: reservation.id };
  }

  const bypassLimit = await canBookLongTennisSlots(user);
  const ruleError = validateBookingRules(startsAt, endsAt, bypassLimit);
  if (ruleError) return { error: ruleError };

  const wantsSeries = Boolean(adminOptions?.seriesEnabled);
  const wantsAdminBlock = Boolean(label) || wantsSeries;

  if (wantsAdminBlock && !bypassLimit) {
    return {
      error:
        "Kommentar und Serienbuchung sind nur für Haupt-Admins und Tennis-Sektions-Admins.",
    };
  }

  if (wantsAdminBlock) {
    let occurrences = [{ startsAt, endsAt }];
    let seriesId: string | null = null;

    if (wantsSeries) {
      const until = parseSeriesUntilDate(adminOptions?.seriesUntilDate ?? "");
      if (!until) {
        return { error: "Bitte ein gültiges Enddatum für die Serie wählen." };
      }
      const weekday = Number(adminOptions?.seriesWeekday ?? isoWeekday(startsAt));
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
        return { error: "Bitte einen Wochentag für die Wiederholung wählen." };
      }
      if (until.getTime() < startsAt.getTime()) {
        return {
          error: "Das Serien-Enddatum darf nicht vor dem Starttermin liegen.",
        };
      }
      occurrences = buildCourtSeriesOccurrences(startsAt, endsAt, until, weekday);
      if (occurrences.length === 0) {
        return { error: "Für die Serie wurden keine Termine gefunden." };
      }
      if (occurrences.length === 1) {
        return {
          error:
            "Die Serie enthält nur den Starttermin. Bitte ein späteres Enddatum wählen.",
        };
      }
      seriesId = randomUUID();
    }

    const overlap = await findSeriesOverlaps(courtId, occurrences);
    if (overlap) {
      return {
        error:
          occurrences.length > 1
            ? "Mindestens ein Termin der Serie ist bereits belegt."
            : "Dieser Zeitraum ist bereits belegt.",
      };
    }

    await prisma.courtReservation.createMany({
      data: occurrences.map((occurrence) => ({
        courtId,
        userId: user.id,
        label,
        seriesId,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        priceCents: 0,
        paidAt: new Date(),
        status: "CONFIRMED" as const,
      })),
    });
    revalidateBookingPaths();
    return { ok: true };
  }

  const overlap = await findSlotOverlap(courtId, startsAt, endsAt);
  if (overlap) {
    return { error: "Dieser Zeitraum ist bereits belegt." };
  }

  const isFree = await courtBookingIsFree(user.id);
  const priceCents = isFree
    ? 0
    : courtBookingPriceCents(court.priceCentsPerHour, startsAt, endsAt);
  const creditBalance = useCredit
    ? await getSpendableCourtCreditCents(user.id, court.sectionId)
    : 0;
  const creditAppliedCents = Math.min(creditBalance, priceCents);

  if (priceCents <= 0) {
    await prisma.courtReservation.create({
      data: {
        courtId,
        userId: user.id,
        startsAt,
        endsAt,
        priceCents: 0,
        paidAt: new Date(),
        status: "CONFIRMED",
      },
    });
    revalidateBookingPaths();
    return { ok: true };
  }

  const reservation = await prisma.courtReservation.create({
    data: {
      courtId,
      userId: user.id,
      startsAt,
      endsAt,
      priceCents,
      creditAppliedCents,
      status: "PENDING",
    },
  });

  const checkout = await beginCourtReservationCheckout(reservation.id);
  if ("error" in checkout) {
    await prisma.courtReservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED" },
    });
    return { error: checkout.error ?? "Zahlung konnte nicht gestartet werden." };
  }

  revalidateBookingPaths();
  return { paymentUrl: checkout.url, reservationId: reservation.id };
}

export async function cancelReservationAction(
  reservationId: string,
  scope: CancelReservationScope = "one",
): Promise<ReservationActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Nicht angemeldet." };
  }

  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
    include: {
      court: {
        select: {
          name: true,
          sectionId: true,
          cancelRefundMinutesBeforeStart: true,
        },
      },
    },
  });
  if (!reservation) {
    return { error: "Reservierung nicht gefunden." };
  }

  const canManageBlocks = await canBookLongTennisSlots(user);
  if (
    reservation.userId !== user.id &&
    user.role !== "ADMIN" &&
    !canManageBlocks
  ) {
    return { error: "Keine Berechtigung." };
  }
  if (reservation.status === "CANCELLED") {
    return { error: "Bereits storniert." };
  }

  const now = new Date();
  if (
    !reservation.userId &&
    !canCancelGuestReservation(reservation.startsAt, now)
  ) {
    return {
      error:
        "Gast-Reservierungen können nur bis zum Vortag gelöscht werden. Am Tag der Reservierung ist das nicht mehr möglich.",
    };
  }
  const paid = courtReservationIsPaid(reservation);
  const privilegedCancel = user.role === "ADMIN" || canManageBlocks;

  if (!privilegedCancel && reservation.status === "CONFIRMED") {
    // Bezahlte Buchungen: Storno nur bis cancelRefundMinutesBeforeStart vor Beginn
    // (Kartenanteil abzüglich Stripe-Gebühr zurück auf die Karte).
    // Kostenlos / Saisonkarte: jederzeit stornierbar.
    if (
      paid &&
      !canCancelPaidCourtReservation(
        reservation.startsAt,
        reservation.court.cancelRefundMinutesBeforeStart,
        now,
      )
    ) {
      return {
        error: `Achtung: Bezahlte Reservierungen können nur bis ${reservation.court.cancelRefundMinutesBeforeStart} Minuten vor Beginn storniert werden. Rückerstattung abzüglich Transaktionskosten.`,
      };
    }
  }

  const targets =
    scope === "series" && reservation.seriesId
      ? await prisma.courtReservation.findMany({
          where: {
            seriesId: reservation.seriesId,
            status: { not: "CANCELLED" },
            startsAt: { gte: reservation.startsAt },
          },
          include: {
            court: { select: { name: true, sectionId: true } },
          },
        })
      : [reservation];

  if (targets.length === 0) {
    return { error: "Keine Termine zum Stornieren gefunden." };
  }

  for (const target of targets) {
    if (!target.userId && !canCancelGuestReservation(target.startsAt, now)) {
      return {
        error:
          "Gast-Reservierungen können nur bis zum Vortag gelöscht werden. Am Tag der Reservierung ist das nicht mehr möglich.",
      };
    }
  }

  const refundedIds: string[] = [];
  let restoredCreditCents = 0;
  let cardRefundCreditedCents = 0;
  let pendingRefundCents = 0;
  for (const target of targets) {
    try {
      const refund = await refundPaidCourtReservation(target);
      restoredCreditCents +=
        refund.restoredCreditCents + refund.cardRefundCreditedCents;
      cardRefundCreditedCents += refund.cardRefundCreditedCents;
      pendingRefundCents += refund.pendingRefundCents;
      if (refund.cardRefunded) refundedIds.push(target.id);
    } catch (error) {
      console.error("Tennisplatz-Erstattung", target.id, error);
      return {
        error: describeCardRefundError(
          error,
          "Die Rückerstattung auf die Karte ist fehlgeschlagen. Die Reservierung wurde nicht storniert.",
        ),
      };
    }
  }

  const cancelledAt = new Date();
  await prisma.courtReservation.updateMany({
    where: { id: { in: targets.map((item) => item.id) } },
    data: { status: "CANCELLED" },
  });
  if (refundedIds.length > 0) {
    await prisma.courtReservation.updateMany({
      where: { id: { in: refundedIds } },
      data: { cardRefundedAt: cancelledAt },
    });
  }

  revalidateBookingPaths();
  return {
    ok: true,
    creditedCents: restoredCreditCents,
    cardRefundCreditedCents,
    pendingRefundCents,
  };
}

export async function updateCourtPriceAction(
  courtId: string,
  priceEuro: string,
): Promise<{ error: string } | null> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

  const normalized = priceEuro.trim().replace(",", ".");
  const euros = Number(normalized);
  if (!Number.isFinite(euros) || euros < 0 || euros > 500) {
    return { error: "Bitte einen gültigen Stundenpreis zwischen 0 und 500 € angeben." };
  }

  const priceCentsPerHour = Math.round(euros * 100);
  await prisma.court.update({
    where: { id: courtId },
    data: { priceCentsPerHour },
  });
  revalidateBookingPaths();
  return null;
}

export async function updateCourtCancelRefundMinutesAction(
  courtId: string,
  minutesRaw: string,
): Promise<{ error: string } | null> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

  const minutes = Number(minutesRaw.trim());
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10_080) {
    return {
      error: "Bitte eine ganze Zahl zwischen 0 und 10.080 Minuten (7 Tage) angeben.",
    };
  }

  await prisma.court.update({
    where: { id: courtId },
    data: { cancelRefundMinutesBeforeStart: minutes },
  });
  revalidateBookingPaths();
  return null;
}

export async function updateCourtSectionAction(
  courtId: string,
  sectionId: string,
): Promise<{ error: string } | null> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

  const sectionError = await validateSectionId(sectionId.trim() || null);
  if (sectionError) return { error: sectionError };

  await prisma.court.update({
    where: { id: courtId },
    data: { sectionId },
  });
  revalidateBookingPaths();
  return null;
}

export async function createCourtAction(
  _prev: CourtFormState,
  formData: FormData,
): Promise<CourtFormState> {
  const draft = {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "Freiluft"),
    priceEuro: String(formData.get("priceEuro") ?? ""),
    sectionId: String(formData.get("sectionId") ?? ""),
  };
  const courtError = (error: string): CourtFormState => ({ error, fields: draft });

  const admin = await requireAdmin();
  if (!admin) return courtError("Keine Berechtigung.");

  const name = draft.name.trim();
  const category = draft.category.trim() || "Freiluft";
  const priceEuro = draft.priceEuro.trim().replace(",", ".");
  const sectionId = parseRequiredSectionId(draft.sectionId);
  const sectionError = await validateSectionId(sectionId);
  if (sectionError) return courtError(sectionError);

  if (name.length < 2) {
    return courtError("Bitte einen Namen für den Platz angeben.");
  }

  const euros = Number(priceEuro);
  if (!Number.isFinite(euros) || euros < 0 || euros > 500) {
    return courtError(
      "Bitte einen gültigen Stundenpreis zwischen 0 und 500 € angeben.",
    );
  }

  const maxOrder = await prisma.court.aggregate({ _max: { sortOrder: true } });

  await prisma.court.create({
    data: {
      name,
      category,
      priceCentsPerHour: Math.round(euros * 100),
      sectionId,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  revalidateBookingPaths();
  return { ok: true };
}

export async function toggleCourtBlockedAction(courtId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Nicht berechtigt.");

  const court = await prisma.court.findUnique({ where: { id: courtId } });
  if (!court) throw new Error("Platz nicht gefunden.");

  await prisma.court.update({
    where: { id: courtId },
    data: { blocked: !court.blocked },
  });
  revalidateBookingPaths();
}

export async function adminCancelReservationAction(
  reservationId: string,
): Promise<
  | { error: string }
  | { ok: true; cardRefundCreditedCents: number; pendingRefundCents: number }
> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nicht berechtigt." };

  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
    include: {
      court: { select: { name: true, sectionId: true } },
    },
  });
  if (!reservation) return { error: "Reservierung nicht gefunden." };
  if (
    !reservation.userId &&
    !canCancelGuestReservation(reservation.startsAt)
  ) {
    return {
      error:
        "Gast-Reservierungen können nur bis zum Vortag gelöscht werden. Am Tag der Reservierung ist das nicht mehr möglich.",
    };
  }
  if (reservation.status === "CANCELLED") {
    return { error: "Bereits storniert." };
  }

  let cardRefunded = false;
  let cardRefundCreditedCents = 0;
  let pendingRefundCents = 0;
  try {
    const refund = await refundPaidCourtReservation(reservation);
    cardRefunded = refund.cardRefunded;
    cardRefundCreditedCents = refund.cardRefundCreditedCents;
    pendingRefundCents = refund.pendingRefundCents;
  } catch (error) {
    console.error("Tennisplatz-Erstattung", reservation.id, error);
    return {
      error: describeCardRefundError(
        error,
        "Die Rückerstattung auf die Karte ist fehlgeschlagen. Die Reservierung wurde nicht storniert.",
      ),
    };
  }

  await prisma.courtReservation.update({
    where: { id: reservationId },
    data: {
      status: "CANCELLED",
      ...(cardRefunded ? { cardRefundedAt: new Date() } : {}),
    },
  });
  revalidateBookingPaths();
  return { ok: true, cardRefundCreditedCents, pendingRefundCents };
}

export async function deleteCourtAction(
  courtId: string,
): Promise<{ error: string } | null> {
  const admin = await requireAdmin();
  if (!admin) {
    return { error: "Keine Berechtigung, Plätze zu löschen." };
  }

  const upcoming = await prisma.courtReservation.count({
    where: {
      courtId,
      status: { in: ["CONFIRMED", "PENDING"] },
      startsAt: { gte: new Date() },
    },
  });

  if (upcoming > 0) {
    return {
      error:
        "Dieser Platz kann nicht gelöscht werden, weil noch Reservierungen offen sind.",
    };
  }

  await prisma.courtReservation.deleteMany({ where: { courtId } });
  await prisma.court.delete({ where: { id: courtId } });
  revalidateBookingPaths();
  return null;
}
