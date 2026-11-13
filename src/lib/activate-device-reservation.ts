import { revalidatePath } from "next/cache";
import { checkoutHoldSince } from "@/lib/checkout-hold";
import { finalizeDeviceReservationPayment } from "@/lib/credit";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { resolveCheckoutSessionStripeFees } from "@/lib/stripe-fees";
import { withStripeAccounts } from "@/lib/stripe";

export function revalidateDeviceBookingPaths() {
  revalidatePath("/admin/geraete");
  revalidatePath("/admin/buchhaltung");
  revalidatePath("/autos");
  revalidatePath("/autos/meine");
  revalidatePath("/konto");
  revalidatePath("/", "layout");
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

async function findDeviceOverlap(
  deviceId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  return prisma.deviceReservation.findFirst({
    where: {
      deviceId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      ...deviceReservationBlocksSlotWhere(),
    },
  });
}

/** Interne Aktivierung – nicht als Server Action exportieren. */
export async function activateDeviceReservation(reservationId: string) {
  const reservation = await prisma.deviceReservation.findUnique({
    where: { id: reservationId },
    include: { device: true },
  });
  if (!reservation || reservation.status === "CANCELLED") return null;

  if (reservation.status === "CONFIRMED") {
    return reservation;
  }

  const overlap = await findDeviceOverlap(
    reservation.deviceId,
    reservation.startsAt,
    reservation.endsAt,
    reservation.id,
  );
  if (overlap) return null;

  const updated = await prisma.deviceReservation.update({
    where: { id: reservationId },
    data: {
      status: "CONFIRMED",
      paidAt: new Date(),
    },
    include: { device: true },
  });
  revalidateDeviceBookingPaths();
  return updated;
}

function stripeSessionLooksPaid(session: {
  payment_status?: string | null;
  status?: string | null;
}) {
  return session.payment_status === "paid" || session.status === "complete";
}

/** Nur nach verifizierter Stripe-Session – nicht als Server Action. */
export async function fulfillDeviceReservationSession(sessionId: string) {
  const session = await withStripeAccounts((stripe) =>
    stripe.checkout.sessions.retrieve(sessionId),
  );
  if (!stripeSessionLooksPaid(session)) return null;

  const creditApplied = Number(session.metadata?.creditAppliedCents ?? 0);
  const payerUserId = session.metadata?.payerUserId;
  const reservationIdFromMeta = session.metadata?.deviceReservationId;

  const reservation = await prisma.deviceReservation.findFirst({
    where: { stripeSessionId: sessionId },
    include: { device: true },
  });

  const targetId = reservation?.id ?? reservationIdFromMeta;
  if (!targetId) return null;

  if (payerUserId && creditApplied > 0) {
    await finalizeDeviceReservationPayment(payerUserId, targetId);
  }

  const activated = await activateDeviceReservation(targetId);
  if (!activated) return null;

  const externalCents = externalPaymentDueCents(
    activated.priceCents,
    activated.priceCents,
    activated.creditAppliedCents,
    false,
  );
  if (externalCents > 0) {
    const fees = await resolveCheckoutSessionStripeFees(sessionId, [
      { key: targetId, externalCents },
    ]);
    const fee = fees.get(targetId)?.feeCents;
    if (fee != null) {
      await prisma.deviceReservation.update({
        where: { id: targetId },
        data: { stripeFeeCents: fee },
      });
    }
  }

  return {
    kind: "device" as const,
    title: activated.device.name,
  };
}
