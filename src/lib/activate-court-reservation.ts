import { revalidatePath } from "next/cache";
import { courtCheckoutHoldSince } from "@/lib/court-booking";
import { sendCourtReservationReceipt } from "@/lib/court-receipt";
import { finalizeCourtReservationPayment } from "@/lib/credit";
import { getLocale } from "@/lib/i18n/locale";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { resolveCheckoutSessionStripeFees } from "@/lib/stripe-fees";
import { withStripeAccounts } from "@/lib/stripe";

export function revalidateCourtBookingPaths() {
  revalidatePath("/tennisplatz");
  revalidatePath("/tennisplatz/meine");
  revalidatePath("/konto");
  revalidatePath("/admin/tennisplaetze");
  revalidatePath("/admin/buchhaltung");
  revalidatePath("/", "layout");
}

async function findSlotOverlap(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  const holdSince = courtCheckoutHoldSince();
  return prisma.courtReservation.findFirst({
    where: {
      courtId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING", createdAt: { gte: holdSince } },
      ],
    },
  });
}

/** Interne Aktivierung – nicht als Server Action exportieren. */
export async function activateCourtReservation(reservationId: string) {
  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
    include: { court: true },
  });
  if (!reservation || reservation.status === "CANCELLED") return null;

  let updated = reservation;

  if (reservation.status !== "CONFIRMED") {
    const overlap = await findSlotOverlap(
      reservation.courtId,
      reservation.startsAt,
      reservation.endsAt,
      reservation.id,
    );
    if (overlap) return null;

    updated = await prisma.courtReservation.update({
      where: { id: reservationId },
      data: {
        status: "CONFIRMED",
        paidAt: new Date(),
      },
      include: { court: true },
    });
    revalidateCourtBookingPaths();
  }

  if (updated.priceCents > 0) {
    const locale = await getLocale().catch(() => "de" as const);
    void sendCourtReservationReceipt(updated.id, { locale }).catch((error) => {
      console.error("Tennis-Quittung", updated.id, error);
    });
  }

  return updated;
}

function stripeSessionLooksPaid(session: {
  payment_status?: string | null;
  status?: string | null;
}) {
  return session.payment_status === "paid" || session.status === "complete";
}

/** Nur nach verifizierter Stripe-Session – nicht als Server Action. */
export async function fulfillCourtReservationSession(sessionId: string) {
  const session = await withStripeAccounts((stripe) =>
    stripe.checkout.sessions.retrieve(sessionId),
  );
  if (!stripeSessionLooksPaid(session)) return null;

  const creditApplied = Number(session.metadata?.creditAppliedCents ?? 0);
  const payerUserId = session.metadata?.payerUserId;
  const reservationIdFromMeta = session.metadata?.reservationId;

  const reservation = await prisma.courtReservation.findFirst({
    where: { stripeSessionId: sessionId },
    include: { court: true },
  });

  const targetId = reservation?.id ?? reservationIdFromMeta;
  if (!targetId) return null;

  if (payerUserId && creditApplied > 0) {
    await finalizeCourtReservationPayment(payerUserId, targetId);
  }

  const activated = await activateCourtReservation(targetId);
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
      await prisma.courtReservation.update({
        where: { id: targetId },
        data: { stripeFeeCents: fee },
      });
    }
  }

  return {
    kind: "court" as const,
    title: activated.court.name,
  };
}
