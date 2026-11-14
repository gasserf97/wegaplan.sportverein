import { randomBytes } from "crypto";
import { activateCourtReservation } from "@/lib/activate-court-reservation";
import { activateDeviceReservation } from "@/lib/activate-device-reservation";
import { activateSubscription } from "@/lib/activate-subscription";
import { sendCourseEnrollmentConfirmations } from "@/lib/booking-confirmation";
import { grantBundledPlansForPaidEnrollments } from "@/lib/course-bundled-plan";
import {
  finalizeCourseEnrollmentPayments,
  finalizeCourtReservationPayment,
  finalizeDeviceReservationPayment,
  finalizeSubscriptionPayments,
} from "@/lib/credit";
import { prisma } from "@/lib/prisma";
import { revalidateEnrollmentViews } from "@/lib/revalidate-enrollments";
import { isStripeDemoMode } from "@/lib/stripe";
import { clearWaitlistOfferData } from "@/lib/waitlist";

export const SHOWCASE_SESSION_PREFIX = "cs_test_showcase_";
export const STRIPE_TEST_CARD = "4242424242424242";

export function isShowcaseSessionId(sessionId: string) {
  return sessionId.startsWith(SHOWCASE_SESSION_PREFIX);
}

export function newShowcaseSessionId() {
  return `${SHOWCASE_SESSION_PREFIX}${randomBytes(12).toString("hex")}`;
}

export function showcaseCheckoutPath(sessionId: string) {
  return `/zahlung/stripe-test?session_id=${encodeURIComponent(sessionId)}`;
}

/** Hängt die Buchung an eine lokale Test-Session, wenn kein Stripe-Schlüssel gesetzt ist. */
export async function startShowcaseCheckout(
  assign: (sessionId: string) => Promise<void>,
) {
  if (!isStripeDemoMode()) return null;
  const sessionId = newShowcaseSessionId();
  await assign(sessionId);
  return { url: showcaseCheckoutPath(sessionId) };
}

export function isShowcaseTestCard(raw: string) {
  return raw.replace(/\s+/g, "") === STRIPE_TEST_CARD;
}

function demoFeeCents(amountCents: number) {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * 0.015) + 25;
}

export async function loadShowcaseCheckout(sessionId: string) {
  if (!isShowcaseSessionId(sessionId)) return null;

  const [enrollments, subscriptions, court, device] = await Promise.all([
    prisma.enrollment.findMany({
      where: { stripeSessionId: sessionId },
      include: { course: true, user: { select: { name: true } } },
    }),
    prisma.subscription.findMany({
      where: { stripeSessionId: sessionId },
      include: { plan: true, user: { select: { name: true } } },
    }),
    prisma.courtReservation.findFirst({
      where: { stripeSessionId: sessionId },
      include: { court: true },
    }),
    prisma.deviceReservation.findFirst({
      where: { stripeSessionId: sessionId },
      include: { device: true, user: { select: { name: true } } },
    }),
  ]);

  if (enrollments.length > 0) {
    const amountCents = enrollments.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          (item.paidCents ?? item.course.priceCents) - item.creditAppliedCents,
        ),
      0,
    );
    return {
      kind: "course" as const,
      title: enrollments[0].course.title,
      amountCents,
      paid: enrollments.every((item) => item.status === "PAID"),
      payerUserId: enrollments[0].purchasedById,
    };
  }

  if (subscriptions.length > 0) {
    const amountCents = subscriptions.reduce(
      (sum, item) =>
        sum + Math.max(0, (item.paidCents ?? item.plan.priceCents) - item.creditAppliedCents),
      0,
    );
    return {
      kind: "subscription" as const,
      title: subscriptions[0].plan.title,
      amountCents,
      paid: subscriptions.every((item) => item.status === "ACTIVE"),
      payerUserId: subscriptions[0].purchasedById,
    };
  }

  if (court) {
    return {
      kind: "court" as const,
      title: court.court.name,
      amountCents: Math.max(0, court.priceCents - court.creditAppliedCents),
      paid: court.status === "CONFIRMED",
      payerUserId: court.userId,
    };
  }

  if (device) {
    return {
      kind: "device" as const,
      title: device.device.name,
      amountCents: Math.max(0, device.priceCents - device.creditAppliedCents),
      paid: device.status === "CONFIRMED",
      payerUserId: device.userId,
    };
  }

  return null;
}

/** Schließt eine Vorführ-Zahlung ab, ohne Stripe aufzurufen. */
export async function fulfillShowcaseSession(sessionId: string) {
  const checkout = await loadShowcaseCheckout(sessionId);
  if (!checkout) return null;
  if (checkout.paid) return checkout;

  const paymentId = `pi_test_${sessionId}`;

  if (checkout.kind === "court") {
    const reservation = await prisma.courtReservation.findFirst({
      where: { stripeSessionId: sessionId },
    });
    if (!reservation) return null;
    if (reservation.creditAppliedCents > 0 && reservation.userId) {
      await finalizeCourtReservationPayment(reservation.userId, reservation.id);
    }
    const fee = demoFeeCents(checkout.amountCents);
    await prisma.courtReservation.update({
      where: { id: reservation.id },
      data: { stripeFeeCents: fee },
    });
    await activateCourtReservation(reservation.id);
    return loadShowcaseCheckout(sessionId);
  }

  if (checkout.kind === "device") {
    const reservation = await prisma.deviceReservation.findFirst({
      where: { stripeSessionId: sessionId },
    });
    if (!reservation) return null;
    if (reservation.creditAppliedCents > 0) {
      await finalizeDeviceReservationPayment(reservation.userId, reservation.id);
    }
    await prisma.deviceReservation.update({
      where: { id: reservation.id },
      data: { stripeFeeCents: demoFeeCents(checkout.amountCents) },
    });
    await activateDeviceReservation(reservation.id);
    return loadShowcaseCheckout(sessionId);
  }

  if (checkout.kind === "subscription") {
    const items = await prisma.subscription.findMany({
      where: { stripeSessionId: sessionId },
    });
    const payerUserId = items[0]?.purchasedById;
    const credit = items.reduce((sum, item) => sum + item.creditAppliedCents, 0);
    if (payerUserId && credit > 0) {
      await finalizeSubscriptionPayments(
        payerUserId,
        items.map((item) => item.id),
      );
    }
    for (const item of items) {
      if (item.status === "ACTIVE") continue;
      await activateSubscription(item.id, {
        paidCents: item.paidCents ?? undefined,
        paymentMethod: "STRIPE",
        paymentSource: "checkout",
        stripePaymentId: paymentId,
        stripeFeeCents: demoFeeCents(
          Math.max(0, (item.paidCents ?? 0) - item.creditAppliedCents),
        ),
      });
    }
    return loadShowcaseCheckout(sessionId);
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { stripeSessionId: sessionId },
    include: { course: true },
  });
  const pending = enrollments.filter((item) => item.status !== "PAID");
  if (pending.length === 0) return checkout;

  const payerUserId = pending[0].purchasedById;
  const credit = pending.reduce((sum, item) => sum + item.creditAppliedCents, 0);
  if (payerUserId && credit > 0) {
    await finalizeCourseEnrollmentPayments(
      payerUserId,
      pending.map((item) => item.id),
    );
  }

  const now = new Date();
  await prisma.$transaction(
    pending.map((enrollment) =>
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: "PAID",
          paidAt: now,
          paymentMethod: "STRIPE",
          paidCents: enrollment.paidCents ?? enrollment.course.priceCents,
          stripeFeeCents: demoFeeCents(
            Math.max(
              0,
              (enrollment.paidCents ?? enrollment.course.priceCents) -
                enrollment.creditAppliedCents,
            ),
          ),
          ...clearWaitlistOfferData(),
        },
      }),
    ),
  );

  const ids = pending.map((item) => item.id);
  await sendCourseEnrollmentConfirmations(ids).catch((error) => {
    console.error("Kurs-Bestätigungsmails", ids, error);
  });
  await grantBundledPlansForPaidEnrollments(ids);
  revalidateEnrollmentViews(pending.map((item) => item.courseId));
  return loadShowcaseCheckout(sessionId);
}
