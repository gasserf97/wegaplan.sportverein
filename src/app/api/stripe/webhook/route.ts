import {
  fulfillStripeSession,
  fulfillStripeSubscriptionInvoice,
} from "@/app/actions/checkout";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  listAllStripeSecretKeys,
  listAllStripeWebhookSecrets,
} from "@/lib/section-payments";
import {
  getPlatformStripe,
  platformWebhookSecret,
  saveConnectAccount,
} from "@/lib/stripe-connect";
import { getStripeWithKey, stripeSubscriptionIdFromInvoice } from "@/lib/stripe";
import { currentClubId, runWithClub } from "@/lib/tenant";
import type Stripe from "stripe";

async function verifyLegacyEvent(body: string, signature: string) {
  const secrets = await listAllStripeWebhookSecrets();
  const keys = await listAllStripeSecretKeys();
  if (secrets.length === 0 || keys.length === 0) return null;
  const stripe = getStripeWithKey(keys[0]);
  for (const webhookSecret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      // Nächstes Sektions-Secret versuchen
    }
  }
  return null;
}

async function clubIdForEvent(event: Stripe.Event) {
  if (event.account) {
    const row = await prisma.sectionPaymentConfig.findFirst({
      where: { stripeAccountId: event.account },
      select: { section: { select: { clubId: true } } },
    });
    if (row?.section.clubId) return row.section.clubId;
  }
  return currentClubId();
}

async function handleStripeEvent(event: Stripe.Event) {
  if (event.type === "account.updated") {
    await saveConnectAccount(event.data.object as Stripe.Account);
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
}

export async function POST(request: Request) {
  const body = await request.text();
  const headerList = await headers();
  const signature = headerList.get("stripe-signature");
  if (!signature) {
    return new Response("Signatur fehlt", { status: 400 });
  }

  let event: Stripe.Event | null = null;
  const connectSecret = platformWebhookSecret();
  if (connectSecret) {
    try {
      event = getPlatformStripe().webhooks.constructEvent(body, signature, connectSecret);
    } catch {
      event = null;
    }
  }
  if (!event) {
    event = await verifyLegacyEvent(body, signature);
  }
  if (!event) {
    const configured = Boolean(connectSecret) || (await listAllStripeWebhookSecrets()).length > 0;
    return new Response(configured ? "Ungültige Signatur" : "Webhook nicht konfiguriert", {
      status: configured ? 400 : 501,
    });
  }

  const clubId = await clubIdForEvent(event);
  if (clubId) {
    await runWithClub(clubId, () => handleStripeEvent(event));
  } else {
    await handleStripeEvent(event);
  }
  return new Response("ok", { status: 200 });
}
