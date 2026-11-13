import { isStripeConfigured, withStripeAccounts } from "@/lib/stripe";
import { listAllStripeSecretKeys } from "@/lib/section-payments";

export type StripeFeeConfig = {
  percent: number;
  fixedCents: number;
};

export function getStripeFeeConfig(): StripeFeeConfig {
  const percent = Number(process.env.STRIPE_FEE_PERCENT ?? "1.5");
  const fixedCents = Number(process.env.STRIPE_FEE_FIXED_CENTS ?? "25");
  return {
    percent: Number.isFinite(percent) ? percent : 1.5,
    fixedCents: Number.isFinite(fixedCents) ? fixedCents : 25,
  };
}

/** Geschätzte Stripe-Gebühr (Standard: 1,5 % + 0,25 € pro Kartenzahlung in EUR). */
export function estimateStripeFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  const { percent, fixedCents } = getStripeFeeConfig();
  return Math.round(amountCents * (percent / 100) + fixedCents);
}

export function allocateStripeFeeCents(
  totalFeeCents: number,
  parts: { key: string; amountCents: number }[],
): Map<string, number> {
  const total = parts.reduce((sum, part) => sum + part.amountCents, 0);
  const result = new Map<string, number>();
  if (total <= 0 || totalFeeCents <= 0) {
    for (const part of parts) result.set(part.key, 0);
    return result;
  }

  let assigned = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index === parts.length - 1) {
      result.set(part.key, Math.max(0, totalFeeCents - assigned));
      continue;
    }
    const share = Math.round((totalFeeCents * part.amountCents) / total);
    result.set(part.key, share);
    assigned += share;
  }
  return result;
}

async function anyStripeConfigured() {
  if (isStripeConfigured()) return true;
  const keys = await listAllStripeSecretKeys();
  return keys.length > 0;
}

export async function fetchStripeFeeFromPaymentIntent(
  paymentIntentId: string,
): Promise<number | null> {
  if (!(await anyStripeConfigured())) return null;
  try {
    return await withStripeAccounts(async (stripe) => {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge.balance_transaction"],
      });
      const charge = intent.latest_charge;
      if (!charge || typeof charge === "string") return null;

      const balanceTransaction = charge.balance_transaction;
      if (balanceTransaction && typeof balanceTransaction !== "string") {
        return balanceTransaction.fee;
      }
      if (typeof balanceTransaction === "string") {
        const tx = await stripe.balanceTransactions.retrieve(balanceTransaction);
        return tx.fee;
      }
      return null;
    });
  } catch (error) {
    console.error("Stripe Gebühr (PaymentIntent)", paymentIntentId, error);
    return null;
  }
}

export async function fetchStripeFeeFromCheckoutSession(
  sessionId: string,
): Promise<number | null> {
  if (!(await anyStripeConfigured())) return null;
  try {
    return await withStripeAccounts(async (stripe) => {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!paymentIntentId) return null;

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge.balance_transaction"],
      });
      const charge = intent.latest_charge;
      if (!charge || typeof charge === "string") return null;

      const balanceTransaction = charge.balance_transaction;
      if (balanceTransaction && typeof balanceTransaction !== "string") {
        return balanceTransaction.fee;
      }
      if (typeof balanceTransaction === "string") {
        const tx = await stripe.balanceTransactions.retrieve(balanceTransaction);
        return tx.fee;
      }
      return null;
    });
  } catch (error) {
    console.error("Stripe Gebühr (Checkout-Session)", sessionId, error);
    return null;
  }
}

export async function fetchStripeFeeFromInvoice(
  invoiceId: string,
): Promise<number | null> {
  if (!(await anyStripeConfigured())) return null;
  try {
    return await withStripeAccounts(async (stripe) => {
      const invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ["payments.data.payment.payment_intent"],
      });
      const payment = invoice.payments?.data?.[0]?.payment;
      const paymentIntent = payment?.payment_intent;
      const paymentIntentId =
        typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
      if (paymentIntentId) {
        return fetchStripeFeeFromPaymentIntent(paymentIntentId);
      }
      return null;
    });
  } catch (error) {
    console.error("Stripe Gebühr (Invoice)", invoiceId, error);
    return null;
  }
}

export function resolveStripeFeeCents(
  externalAmountCents: number,
  storedFeeCents: number | null | undefined,
): { feeCents: number; estimated: boolean } {
  if (externalAmountCents <= 0) {
    return { feeCents: 0, estimated: false };
  }
  if (storedFeeCents != null && storedFeeCents >= 0) {
    return { feeCents: storedFeeCents, estimated: false };
  }
  return {
    feeCents: estimateStripeFeeCents(externalAmountCents),
    estimated: true,
  };
}

export async function resolveCheckoutSessionStripeFees(
  sessionId: string,
  parts: { key: string; externalCents: number }[],
): Promise<Map<string, { feeCents: number; estimated: boolean }>> {
  const billable = parts.filter((part) => part.externalCents > 0);
  const result = new Map<string, { feeCents: number; estimated: boolean }>();
  if (billable.length === 0) return result;

  const totalExternal = billable.reduce((sum, part) => sum + part.externalCents, 0);
  const fetched = await fetchStripeFeeFromCheckoutSession(sessionId);
  const estimated = fetched == null;
  const totalFee = fetched ?? estimateStripeFeeCents(totalExternal);
  const allocated = allocateStripeFeeCents(
    totalFee,
    billable.map((part) => ({ key: part.key, amountCents: part.externalCents })),
  );

  for (const part of billable) {
    result.set(part.key, {
      feeCents: allocated.get(part.key) ?? 0,
      estimated,
    });
  }
  return result;
}
