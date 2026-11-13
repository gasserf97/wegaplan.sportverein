import {
  fulfillStripeSession,
  fulfillStripeSubscriptionInvoice,
} from "@/app/actions/checkout";
import { headers } from "next/headers";
import {
  listAllStripeSecretKeys,
  listAllStripeWebhookSecrets,
} from "@/lib/section-payments";
import { getStripeWithKey, stripeSubscriptionIdFromInvoice } from "@/lib/stripe";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const secrets = await listAllStripeWebhookSecrets();
  if (secrets.length === 0) {
    return new Response("Webhook nicht konfiguriert", { status: 501 });
  }

  const keys = await listAllStripeSecretKeys();
  if (keys.length === 0) {
    return new Response("Stripe nicht konfiguriert", { status: 501 });
  }

  const body = await request.text();
  const headerList = await headers();
  const signature = headerList.get("stripe-signature");
  if (!signature) {
    return new Response("Signatur fehlt", { status: 400 });
  }

  const stripe = getStripeWithKey(keys[0]);
  let event: Stripe.Event | null = null;
  for (const webhookSecret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      break;
    } catch {
      // Nächstes Sektions-/Env-Secret versuchen
    }
  }
  if (!event) {
    return new Response("Ungültige Signatur", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.id && (session.payment_status === "paid" || session.status === "complete")) {
      await fulfillStripeSession(session.id);
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    const kind = session.metadata?.kind;
    const reservationId = session.metadata?.reservationId;
    const deviceReservationId = session.metadata?.deviceReservationId;

    if (kind === "court" && reservationId) {
      const { abandonPendingCourtCheckout } = await import("@/lib/abandon-checkout");
      await abandonPendingCourtCheckout(reservationId, { asSystem: true });
    } else if (kind === "device" && deviceReservationId) {
      const { abandonPendingDeviceCheckout } = await import("@/lib/abandon-checkout");
      await abandonPendingDeviceCheckout(deviceReservationId, { asSystem: true });
    } else if (session.id) {
      const {
        cancelPendingEnrollmentsByStripeSession,
        cancelPendingSubscriptionsByStripeSession,
        cancelPendingDeviceReservationsByStripeSession,
      } = await import("@/lib/expire-pending");
      await cancelPendingEnrollmentsByStripeSession(session.id);
      await cancelPendingSubscriptionsByStripeSession(session.id);
      await cancelPendingDeviceReservationsByStripeSession(session.id);
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeSub = stripeSubscriptionIdFromInvoice(invoice);
    const renewal =
      invoice.billing_reason === "subscription_cycle" ||
      invoice.billing_reason === "subscription_update";
    if (stripeSub && renewal && (invoice.amount_paid ?? 0) > 0) {
      const paidAtSec = invoice.status_transitions?.paid_at ?? invoice.created;
      await fulfillStripeSubscriptionInvoice(stripeSub, {
        id: invoice.id,
        amount_paid: invoice.amount_paid,
        paidAt: paidAtSec ? new Date(paidAtSec * 1000) : undefined,
      });
    }
  }

  return new Response("ok", { status: 200 });
}
