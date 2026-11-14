"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  activateCourtReservation,
  revalidateCourtBookingPaths,
} from "@/lib/activate-court-reservation";
import {
  reservationBookerName,
  courtCheckoutHoldSince,
} from "@/lib/court-booking";
import { finalizeCourtReservationPayment } from "@/lib/credit";
import { prisma } from "@/lib/prisma";
import {
  formatStripeCheckoutError,
  getAppUrl,
  getStripeForSection,
  productDescription,
  stripeCheckoutSessionCustomer,
  stripeGuestCheckoutOptions,
  stripeCheckoutUnavailableError,
} from "@/lib/stripe";
import { isSectionStripeConfigured } from "@/lib/section-payments";
import { startShowcaseCheckout } from "@/lib/stripe-demo";
import { formatSlotDate, formatSlotTime } from "@/lib/booking";

export async function expireStalePendingCourtReservations() {
  await prisma.courtReservation.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: courtCheckoutHoldSince() },
    },
    data: { status: "CANCELLED" },
  });
}

export async function abandonPendingCourtCheckoutAction(reservationId: string) {
  const { abandonPendingCourtCheckout } = await import("@/lib/abandon-checkout");
  return abandonPendingCourtCheckout(reservationId);
}

export async function beginCourtReservationCheckout(reservationId: string) {
  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
    include: {
      court: true,
      user: { select: { email: true, name: true, phone: true } },
    },
  });

  if (!reservation || reservation.status !== "PENDING") {
    return { error: "Diese Reservierung ist nicht mehr verfügbar." };
  }

  const user = await getCurrentUser();
  if (reservation.userId) {
    if (!user || user.id !== reservation.userId) {
      return { error: "Keine Berechtigung für diese Reservierung." };
    }
  }

  if (reservation.priceCents <= 0) {
    await activateCourtReservation(reservationId);
    return { url: `/zahlung/erfolg?platz=1&kostenlos=1` };
  }

  const cardCents = Math.max(
    0,
    reservation.priceCents - reservation.creditAppliedCents,
  );

  if (cardCents <= 0) {
    if (reservation.creditAppliedCents > 0 && reservation.userId) {
      await finalizeCourtReservationPayment(reservation.userId, reservationId);
    }
    await activateCourtReservation(reservationId);
    return {
      url: `/zahlung/erfolg?platz=1&kostenlos=1&guthaben=1`,
    };
  }

  if (!(await isSectionStripeConfigured(reservation.court.sectionId))) {
    return { error: stripeCheckoutUnavailableError };
  }

  const showcase = await startShowcaseCheckout(async (sessionId) => {
    await prisma.courtReservation.update({
      where: { id: reservation.id },
      data: { stripeSessionId: sessionId },
    });
  });
  if (showcase) {
    revalidateCourtBookingPaths();
    return showcase;
  }

  try {
    const stripe = await getStripeForSection(reservation.court.sectionId);
    const appUrl = await getAppUrl();
    const booker = reservationBookerName(reservation);
    const description = `${reservation.court.name} · ${formatSlotDate(reservation.startsAt)} · ${formatSlotTime(reservation.startsAt)}–${formatSlotTime(reservation.endsAt)} Uhr`;

    const checkoutCustomer = reservation.user
      ? await stripeCheckoutSessionCustomer(
          {
            email: reservation.user.email,
            name: reservation.user.name,
            phone: reservation.user.phone,
          },
          stripe,
        )
      : stripeGuestCheckoutOptions(reservation.guestEmail);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "hosted_page",
      ...checkoutCustomer,
      locale: "de",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur" as const,
            unit_amount: cardCents,
            product_data: {
              name: `Tennisplatz ${reservation.court.name} – ${booker}`,
              ...productDescription(description),
            },
          },
        },
      ],
      metadata: {
        kind: "court",
        reservationId: reservation.id,
        sectionId: reservation.court.sectionId ?? "",
        creditAppliedCents: String(reservation.creditAppliedCents),
        payerUserId: reservation.userId ?? "",
      },
      success_url: `${appUrl}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/zahlung/abbruch?reservation=${reservation.id}`,
    });

    await prisma.courtReservation.update({
      where: { id: reservation.id },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) {
      return { error: "Stripe hat keine Zahlungsseite geliefert." };
    }

    revalidateCourtBookingPaths();
    return { url: session.url };
  } catch (error) {
    console.error("Stripe Platz-Checkout", error);
    return { error: formatStripeCheckoutError(error) };
  }
}
