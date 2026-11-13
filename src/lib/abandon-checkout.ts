import { getCurrentUser } from "@/lib/auth";
import { activateCourtReservation } from "@/lib/activate-court-reservation";
import { activateDeviceReservation } from "@/lib/activate-device-reservation";
import {
  cancelledEnrollmentData,
  cancelledSubscriptionData,
} from "@/lib/expire-pending";
import { prisma } from "@/lib/prisma";
import { listAllStripeSecretKeys } from "@/lib/section-payments";
import { withStripeAccounts } from "@/lib/stripe";

async function expireStripeSession(sessionId: string) {
  if ((await listAllStripeSecretKeys()).length === 0) return "abandoned" as const;
  try {
    return await withStripeAccounts(async (stripe) => {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" || session.status === "complete") {
        return "paid" as const;
      }
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(sessionId);
      }
      return "abandoned" as const;
    });
  } catch (error) {
    console.error("Stripe-Checkout abbrechen", error);
  }
  return "abandoned" as const;
}

/** Freigabe offener Kurs-Checkouts – ohne revalidatePath (sicher während Page-Render). */
export async function abandonPendingCourseCheckout(courseId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: true as const };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      courseId,
      status: "PENDING",
      paymentMethod: { not: "BANK_TRANSFER" },
      OR: [{ userId: user.id }, { purchasedById: user.id }],
    },
  });

  for (const enrollment of enrollments) {
    if (enrollment.stripeSessionId) {
      const outcome = await expireStripeSession(enrollment.stripeSessionId);
      if (outcome === "paid") continue;
    }
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: cancelledEnrollmentData,
    });
  }

  return { ok: true as const };
}

/** Freigabe offener Abo-Checkouts – ohne revalidatePath. */
export async function abandonPendingSubscriptionCheckout(planId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: true as const };

  const subscriptions = await prisma.subscription.findMany({
    where: {
      planId,
      status: "PENDING",
      paymentMethod: { not: "BANK_TRANSFER" },
      OR: [{ userId: user.id }, { purchasedById: user.id }],
    },
  });

  for (const subscription of subscriptions) {
    if (subscription.stripeSessionId) {
      const outcome = await expireStripeSession(subscription.stripeSessionId);
      if (outcome === "paid") continue;
    }
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: cancelledSubscriptionData,
    });
  }

  return { ok: true as const };
}

type AbandonOptions = {
  /** Webhook / System: Ownership nicht prüfen. */
  asSystem?: boolean;
};

async function assertCourtAbandonAllowed(
  reservation: { userId: string | null },
  options?: AbandonOptions,
) {
  if (options?.asSystem) return true;
  // Gastbuchung: Kenntnis der ID gilt als Berechtigung (Cancel-URL).
  if (!reservation.userId) return true;
  const user = await getCurrentUser();
  return Boolean(user && user.id === reservation.userId);
}

async function assertDeviceAbandonAllowed(
  reservation: { userId: string },
  options?: AbandonOptions,
) {
  if (options?.asSystem) return true;
  const user = await getCurrentUser();
  return Boolean(user && user.id === reservation.userId);
}

/** Freigabe offener Tennis-Checkouts – ohne revalidatePath. */
export async function abandonPendingCourtCheckout(
  reservationId: string,
  options?: AbandonOptions,
) {
  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.status !== "PENDING") {
    return { ok: true as const };
  }

  if (!(await assertCourtAbandonAllowed(reservation, options))) {
    return { ok: true as const };
  }

  if (reservation.stripeSessionId && (await listAllStripeSecretKeys()).length > 0) {
    try {
      const outcome = await expireStripeSession(reservation.stripeSessionId);
      // Bereits bezahlt → aktivieren statt stornieren.
      if (outcome === "paid") {
        await activateCourtReservation(reservationId);
        return { ok: true as const };
      }
    } catch (error) {
      console.error("Stripe-Checkout abbrechen", error);
    }
  }

  await prisma.courtReservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED" },
  });
  return { ok: true as const };
}

/** Freigabe offener Fuhrpark-Checkouts – ohne revalidatePath. */
export async function abandonPendingDeviceCheckout(
  reservationId: string,
  options?: AbandonOptions,
) {
  const reservation = await prisma.deviceReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.status !== "PENDING") {
    return { ok: true as const };
  }

  if (!(await assertDeviceAbandonAllowed(reservation, options))) {
    return { ok: true as const };
  }

  if (reservation.stripeSessionId && (await listAllStripeSecretKeys()).length > 0) {
    try {
      const outcome = await expireStripeSession(reservation.stripeSessionId);
      if (outcome === "paid") {
        await activateDeviceReservation(reservationId);
        return { ok: true as const };
      }
    } catch (error) {
      console.error("Stripe Fuhrpark-Checkout abbrechen", error);
    }
  }

  await prisma.deviceReservation.update({
    where: { id: reservationId },
    data: { status: "CANCELLED" },
  });
  return { ok: true as const };
}
