import type Stripe from "stripe";
import {
  getStripeWithKey,
  isWrongStripeAccountError,
} from "@/lib/stripe";

/** Unter diesem Betrag lehnt Stripe eine EUR-Teilrückerstattung ab. */
export const STRIPE_EUR_MIN_REFUND_CENTS = 50;

/**
 * Kartenbetrag abzüglich Gebühr. Liegt der Rest unter 0,50 €, geht der volle
 * Kartenbetrag zurück: Stripe nimmt kleinere Teilbeträge nicht an.
 */
export function cardRefundAmountCents(
  chargeCents: number,
  netAfterFeeCents: number,
) {
  const charge = Math.max(0, Math.trunc(chargeCents));
  const net = Math.max(0, Math.trunc(netAfterFeeCents));
  if (charge <= 0 || net <= 0) return 0;
  if (net < STRIPE_EUR_MIN_REFUND_CENTS) return charge;
  return Math.min(net, charge);
}

function stripeErrorParts(error: unknown) {
  const err = error as {
    code?: string;
    type?: string;
    message?: string;
    raw?: { code?: string; type?: string; message?: string };
  };
  return {
    code: String(err.raw?.code || err.code || ""),
    type: String(err.raw?.type || err.type || ""),
    message: String(err.raw?.message || err.message || ""),
  };
}

/** Sichtbare Kurzmeldung, ohne Stripe-Schlüssel. */
export function describeCardRefundError(error: unknown, fallback: string) {
  const detail = stripeErrorParts(error)
    .message.replace(/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/g, "Stripe-Schlüssel")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  if (!detail || detail === fallback) return fallback;
  return `${fallback} ${detail}`;
}

function isAmountTooSmall(error: unknown) {
  const { code, message } = stripeErrorParts(error);
  return (
    code === "amount_too_small" ||
    /amount must be at least|betrag muss mindestens/i.test(message)
  );
}

function isAlreadyRefunded(error: unknown) {
  const { code, message } = stripeErrorParts(error);
  return (
    code === "charge_already_refunded" ||
    /already been refunded|already refunded/i.test(message)
  );
}

function isRefundPermissionError(error: unknown) {
  const { type, message } = stripeErrorParts(error);
  return (
    type === "StripePermissionError" ||
    /required permissions/i.test(message)
  );
}

function paymentFromSession(session: Stripe.Checkout.Session) {
  const intent = session.payment_intent;
  if (!intent) {
    return { intentId: null as string | null, chargeId: null as string | null, refundableCents: null as number | null };
  }
  if (typeof intent === "string") {
    return {
      intentId: intent,
      chargeId: null as string | null,
      refundableCents: session.amount_total,
    };
  }
  const latest = intent.latest_charge;
  const charge = latest && typeof latest !== "string" ? latest : null;
  const charged = charge?.amount ?? intent.amount_received ?? intent.amount;
  const refunded = charge?.amount_refunded ?? 0;
  return {
    intentId: intent.id,
    chargeId: typeof latest === "string" ? latest : charge?.id ?? null,
    refundableCents: Math.max(0, charged - refunded),
  };
}

async function createRefund(
  stripe: Stripe,
  input: {
    intentId: string | null;
    chargeId: string | null;
    amountCents: number;
    idempotencyKey: string;
  },
) {
  await stripe.refunds.create(
    {
      ...(input.chargeId
        ? { charge: input.chargeId }
        : { payment_intent: input.intentId ?? "" }),
      amount: input.amountCents,
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

async function refundLoadedSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  input: { amountCents: number; idempotencyKey: string },
) {
  const payment = paymentFromSession(session);
  if (!payment.intentId && !payment.chargeId) {
    throw new Error("Keine Stripe-Zahlung zur Erstattung gefunden.");
  }
  if (payment.refundableCents === 0) return;

  const requested =
    payment.refundableCents != null
      ? Math.min(input.amountCents, payment.refundableCents)
      : input.amountCents;
  if (requested <= 0) return;

  try {
    await createRefund(stripe, {
      ...payment,
      amountCents: requested,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    if (isAlreadyRefunded(error)) return;
    const full =
      payment.refundableCents != null && payment.refundableCents > requested
        ? payment.refundableCents
        : 0;
    if (!isAmountTooSmall(error) || full <= 0) throw error;
    try {
      await createRefund(stripe, {
        ...payment,
        amountCents: full,
        idempotencyKey: `${input.idempotencyKey}-full`,
      });
    } catch (fullError) {
      if (isAlreadyRefunded(fullError)) return;
      throw fullError;
    }
  }
}

/** Teilrückerstattung einer Checkout-Session auf die ursprüngliche Karte. */
export async function refundStripeCheckoutSession(input: {
  sessionId: string;
  amountCents: number;
  idempotencyKey: string;
  sectionId?: string | null;
}) {
  if (input.amountCents <= 0) return;

  const { listAllStripeSecretKeys, resolveSectionStripeSecretKey } = await import(
    "@/lib/section-payments"
  );
  const sectionKey = input.sectionId
    ? await resolveSectionStripeSecretKey(input.sectionId)
    : null;
  const keys = [
    ...new Set(
      [sectionKey, ...(await listAllStripeSecretKeys())].filter(
        (key): key is string => Boolean(key),
      ),
    ),
  ];
  if (keys.length === 0) {
    throw new Error("Stripe ist nicht konfiguriert.");
  }

  let retrieveError: unknown;
  let refundError: unknown;
  for (const key of keys) {
    const stripe = getStripeWithKey(key);
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(input.sessionId, {
        expand: ["payment_intent.latest_charge"],
      });
    } catch (error) {
      retrieveError = error;
      if (isWrongStripeAccountError(error)) continue;
      throw error;
    }

    try {
      await refundLoadedSession(stripe, session, input);
      return;
    } catch (error) {
      refundError = error;
      if (isRefundPermissionError(error)) continue;
      throw error;
    }
  }

  const last = refundError ?? retrieveError;
  throw last instanceof Error
    ? last
    : new Error("Stripe-Erstattung fehlgeschlagen.");
}
