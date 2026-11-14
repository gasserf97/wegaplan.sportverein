"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { checkoutHoldSince } from "@/lib/checkout-hold";
import {
  deviceBookingPriceCents,
  resolveDailyBookingWindow,
  type DevicePricingMode,
} from "@/lib/device-booking";
import { finalizeDeviceReservationPayment, getCreditBalance, addCreditBalance } from "@/lib/credit";
import { createPendingRefundTransfer } from "@/lib/pending-refund";
import { reservationCreditRefundCents } from "@/lib/payment-amounts";
import { expireStalePendingDeviceReservations } from "@/lib/expire-pending";
import {
  activateDeviceReservation,
  revalidateDeviceBookingPaths,
} from "@/lib/activate-device-reservation";
import { canBookFleetDevices } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  formatStripeCheckoutError,
  getAppUrl,
  getStripeForSection,
  productDescription,
  stripeCheckoutSessionCustomer,
  stripeCheckoutUnavailableError,
} from "@/lib/stripe";
import { isSectionStripeConfigured } from "@/lib/section-payments";
import { startShowcaseCheckout } from "@/lib/stripe-demo";
import { formatSlotDate, formatSlotTime } from "@/lib/booking";

export type DeviceDraftFields = {
  name: string;
  category: string;
  pricingMode: string;
  price: string;
  sectionId: string;
};

export type DeviceActionState =
  | { error: string; fields?: DeviceDraftFields }
  | { ok: true; creditedCents?: number }
  | { paymentUrl: string; reservationId: string }
  | null;

function revalidateDevices() {
  revalidateDeviceBookingPaths();
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

function deviceReservationBlocksSlotWhere() {
  const holdSince = checkoutHoldSince();
  return {
    OR: [
      { status: "CONFIRMED" as const },
      { status: "PENDING" as const, createdAt: { gte: holdSince } },
    ],
  };
}

export async function expireStalePendingDeviceReservationsAction() {
  await expireStalePendingDeviceReservations();
}

export async function abandonPendingDeviceCheckoutAction(reservationId: string) {
  const { abandonPendingDeviceCheckout } = await import("@/lib/abandon-checkout");
  return abandonPendingDeviceCheckout(reservationId);
}

export async function beginDeviceReservationCheckout(reservationId: string) {
  const reservation = await prisma.deviceReservation.findUnique({
    where: { id: reservationId },
    include: {
      device: true,
      user: { select: { email: true, name: true, phone: true } },
    },
  });

  if (!reservation || reservation.status !== "PENDING") {
    return { error: "Diese Reservierung ist nicht mehr verfügbar." };
  }

  const user = await getCurrentUser();
  if (!user || user.id !== reservation.userId) {
    return { error: "Keine Berechtigung für diese Reservierung." };
  }

  if (reservation.priceCents <= 0) {
    await activateDeviceReservation(reservationId);
    return { url: `/zahlung/erfolg?kostenlos=1&geraet=${reservation.deviceId}` };
  }

  const cardCents = Math.max(
    0,
    reservation.priceCents - reservation.creditAppliedCents,
  );

  if (cardCents <= 0) {
    if (reservation.creditAppliedCents > 0) {
      await finalizeDeviceReservationPayment(reservation.userId, reservationId);
    }
    await activateDeviceReservation(reservationId);
    return {
      url: `/zahlung/erfolg?kostenlos=1&geraet=${reservation.deviceId}&guthaben=1`,
    };
  }

  if (!(await isSectionStripeConfigured(reservation.device.sectionId))) {
    return { error: stripeCheckoutUnavailableError };
  }

  const showcase = await startShowcaseCheckout(async (sessionId) => {
    await prisma.deviceReservation.update({
      where: { id: reservation.id },
      data: { stripeSessionId: sessionId },
    });
  });
  if (showcase) {
    revalidateDeviceBookingPaths();
    return showcase;
  }

  try {
    const stripe = await getStripeForSection(reservation.device.sectionId);
    const appUrl = await getAppUrl();
    const description = [
      reservation.device.name,
      formatSlotDate(reservation.startsAt),
      `${formatSlotTime(reservation.startsAt)}–${formatSlotTime(reservation.endsAt)} Uhr`,
      reservation.reason || null,
    ]
      .filter(Boolean)
      .join(" · ");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "hosted_page",
      ...(await stripeCheckoutSessionCustomer(reservation.user, stripe)),
      locale: "de",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur" as const,
            unit_amount: cardCents,
            product_data: {
              name: `${reservation.device.name} – ${reservation.user.name}`,
              ...productDescription(description),
            },
          },
        },
      ],
      metadata: {
        kind: "device",
        deviceReservationId: reservation.id,
        sectionId: reservation.device.sectionId ?? "",
        creditAppliedCents: String(reservation.creditAppliedCents),
        payerUserId: reservation.userId,
      },
      success_url: `${appUrl}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/zahlung/abbruch?geraet=${reservation.id}`,
    });

    await prisma.deviceReservation.update({
      where: { id: reservation.id },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) {
      return { error: "Stripe hat keine Zahlungsseite geliefert." };
    }

    revalidateDevices();
    return { url: session.url };
  } catch (error) {
    console.error("Stripe Fuhrpark-Checkout", error);
    return { error: formatStripeCheckoutError(error) };
  }
}

export async function createDeviceAction(formData: FormData): Promise<DeviceActionState> {
  const fields: DeviceDraftFields = {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "Fahrzeug"),
    pricingMode: String(formData.get("pricingMode") ?? "DAILY"),
    price: String(formData.get("price") ?? ""),
    sectionId: String(formData.get("sectionId") ?? ""),
  };
  const deviceError = (error: string): DeviceActionState => ({ error, fields });

  const admin = await requireAdmin();
  if (!admin) return deviceError("Keine Berechtigung.");

  const name = fields.name.trim();
  const category = fields.category.trim() || "Fahrzeug";
  const pricingMode = (fields.pricingMode === "HOURLY" ? "HOURLY" : "DAILY") as DevicePricingMode;
  const priceRaw = fields.price.replace(",", ".").trim();
  const priceEuros = Number.parseFloat(priceRaw);
  if (!name || name.length < 2) return deviceError("Bitte einen Namen angeben.");
  if (!Number.isFinite(priceEuros) || priceEuros < 0 || priceEuros > 5000) {
    return deviceError("Bitte einen gültigen Preis angeben.");
  }

  const sectionId = parseRequiredSectionId(fields.sectionId);
  const sectionError = await validateSectionId(sectionId);
  if (sectionError) return deviceError(sectionError);

  const maxSort = await prisma.device.aggregate({ _max: { sortOrder: true } });
  await prisma.device.create({
    data: {
      name,
      category,
      pricingMode,
      priceCents: Math.round(priceEuros * 100),
      sectionId,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
  revalidateDevices();
  return { ok: true };
}

export async function updateDeviceAction(
  deviceId: string,
  formData: FormData,
): Promise<DeviceActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "Fahrzeug").trim() || "Fahrzeug";
  const pricingMode = (String(formData.get("pricingMode") ?? "DAILY") === "HOURLY"
    ? "HOURLY"
    : "DAILY") as DevicePricingMode;
  const priceRaw = String(formData.get("price") ?? "").replace(",", ".").trim();
  const priceEuros = Number.parseFloat(priceRaw);
  if (!name || name.length < 2) return { error: "Bitte einen Namen angeben." };
  if (!Number.isFinite(priceEuros) || priceEuros < 0 || priceEuros > 5000) {
    return { error: "Bitte einen gültigen Preis angeben." };
  }

  const sectionId = parseRequiredSectionId(formData.get("sectionId"));
  const sectionError = await validateSectionId(sectionId);
  if (sectionError) return { error: sectionError };

  await prisma.device.update({
    where: { id: deviceId },
    data: {
      name,
      category,
      pricingMode,
      priceCents: Math.round(priceEuros * 100),
      sectionId,
    },
  });
  revalidateDevices();
  return { ok: true };
}

export async function updateDeviceSectionAction(
  deviceId: string,
  sectionId: string,
): Promise<DeviceActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

  const sectionError = await validateSectionId(sectionId.trim() || null);
  if (sectionError) return { error: sectionError };

  await prisma.device.update({
    where: { id: deviceId },
    data: { sectionId },
  });
  revalidateDevices();
  return { ok: true };
}

export async function toggleDeviceBlockedAction(deviceId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Nicht berechtigt.");
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new Error("Fahrzeug nicht gefunden.");
  await prisma.device.update({
    where: { id: deviceId },
    data: { blocked: !device.blocked },
  });
  revalidateDevices();
}

export async function deleteDeviceAction(deviceId: string): Promise<DeviceActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

  const upcoming = await prisma.deviceReservation.count({
    where: {
      deviceId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: new Date() },
    },
  });
  if (upcoming > 0) {
    return { error: "Fahrzeug hat noch anstehende Reservierungen." };
  }

  await prisma.deviceReservation.deleteMany({ where: { deviceId } });
  await prisma.device.delete({ where: { id: deviceId } });
  revalidateDevices();
  return { ok: true };
}

export async function adminCancelDeviceReservationAction(reservationId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error("Nicht berechtigt.");
  await prisma.deviceReservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED" },
  });
  revalidateDevices();
}

const DEVICE_REASON_MAX_LENGTH = 200;

export async function createDeviceReservationAction(
  deviceId: string,
  startsAtIso: string,
  endsAtIso: string,
  billingMode: DevicePricingMode,
  reasonInput: string,
  _useCredit = false,
): Promise<DeviceActionState> {
  const useCredit = false;
  void _useCredit;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=/autos`);
  }

  if (!(await canBookFleetDevices(user))) {
    return {
      error:
        "Fahrzeugreservierung ist nur mit Freigabe durch die Verwaltung möglich.",
    };
  }

  const reason = reasonInput.trim().replace(/\s+/g, " ");
  if (!reason) {
    return { error: "Bitte einen Grund für die Reservierung angeben." };
  }
  if (reason.length > DEVICE_REASON_MAX_LENGTH) {
    return {
      error: `Der Grund darf höchstens ${DEVICE_REASON_MAX_LENGTH} Zeichen haben.`,
    };
  }

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || !device.active || device.blocked) {
    return { error: "Dieses Fahrzeug ist nicht verfügbar." };
  }

  let startsAt = new Date(startsAtIso);
  const endsAt = new Date(endsAtIso);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { error: "Bitte einen gültigen Zeitraum wählen." };
  }

  if (billingMode === "DAILY") {
    const resolved = resolveDailyBookingWindow(startsAt, endsAt);
    if (!resolved) {
      return { error: "Der Zeitraum liegt in der Vergangenheit." };
    }
    startsAt = resolved.start;
  } else if (startsAt < new Date()) {
    return { error: "Der Zeitraum liegt in der Vergangenheit." };
  }

  const overlap = await prisma.deviceReservation.findFirst({
    where: {
      deviceId,
      ...deviceReservationBlocksSlotWhere(),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (overlap) {
    return { error: "Der Zeitraum ist bereits reserviert." };
  }

  const priceCents = deviceBookingPriceCents(device, startsAt, endsAt, billingMode);
  const creditBalance = useCredit ? await getCreditBalance(user.id) : 0;
  const creditAppliedCents = Math.min(creditBalance, priceCents);

  const reservation = await prisma.deviceReservation.create({
    data: {
      deviceId,
      userId: user.id,
      startsAt,
      endsAt,
      billingMode,
      reason,
      priceCents,
      creditAppliedCents,
      status: priceCents > 0 ? "PENDING" : "CONFIRMED",
      paidAt: priceCents > 0 ? null : new Date(),
    },
  });

  revalidateDevices();

  if (priceCents === 0) {
    return { ok: true };
  }

  const checkout = await beginDeviceReservationCheckout(reservation.id);
  if ("error" in checkout) {
    await prisma.deviceReservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED" },
    });
    revalidateDevices();
    return { error: checkout.error ?? "Checkout fehlgeschlagen." };
  }

  if (!checkout.url) {
    await prisma.deviceReservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED" },
    });
    revalidateDevices();
    return { error: "Keine Zahlungsseite verfügbar." };
  }

  return { paymentUrl: checkout.url, reservationId: reservation.id };
}

export async function cancelDeviceReservationAction(
  reservationId: string,
): Promise<DeviceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/autos/meine");

  const reservation = await prisma.deviceReservation.findUnique({
    where: { id: reservationId },
    include: {
      device: { select: { name: true, sectionId: true } },
      user: { select: { name: true } },
    },
  });
  if (!reservation || reservation.userId !== user.id) {
    return { error: "Reservierung nicht gefunden." };
  }

  let creditedCents = 0;
  const refundCents = reservationCreditRefundCents(reservation);
  if (refundCents > 0) {
    creditedCents = refundCents;
    await addCreditBalance(reservation.userId, creditedCents, {
      description: `Stornierung Auto: ${reservation.device.name}`,
      deviceReservationId: reservation.id,
    });

    const externalCents = Math.max(
      0,
      reservation.priceCents - reservation.creditAppliedCents,
    );
    await createPendingRefundTransfer({
      userId: reservation.userId,
      kind: "DEVICE",
      title: reservation.device.name,
      sectionId: reservation.device.sectionId,
      memberName: reservation.user.name,
      paymentMethod: reservation.stripeSessionId ? "STRIPE" : null,
      externalCents,
      stripeFeeCents: reservation.stripeFeeCents,
      stripeSessionId: reservation.stripeSessionId,
      creditedCents,
      deviceReservationId: reservation.id,
    });
  }

  await prisma.deviceReservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED" },
  });
  revalidateDevices();
  return { ok: true, creditedCents };
}
