import {
  getStripeForSection,
  isWrongStripeAccountError,
  withStripeAccounts,
} from "@/lib/stripe";
import type Stripe from "stripe";

export type RenewalChargeResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; reason: string };

/** Off-session charge for local renewals (e.g. minutely test interval). */
export async function chargeSubscriptionRenewal(
  stripeCustomerId: string,
  amountCents: number,
  description: string,
  sectionId?: string | null,
): Promise<RenewalChargeResult> {
  if (amountCents <= 0) {
    return { ok: false, reason: "zero_amount" };
  }

  const chargeOn = async (stripe: Stripe): Promise<RenewalChargeResult> => {
    const methods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 1,
    });
    const paymentMethod = methods.data[0];
    if (!paymentMethod) {
      return { ok: false, reason: "no_payment_method" };
    }
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      customer: stripeCustomerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description,
    });
    if (intent.status !== "succeeded") {
      return { ok: false, reason: `status_${intent.status}` };
    }
    return { ok: true, paymentIntentId: intent.id };
  };

  try {
    const stripe = await getStripeForSection(sectionId);
    return await chargeOn(stripe);
  } catch (error) {
    if (!isWrongStripeAccountError(error)) {
      const message =
        error instanceof Error ? error.message : "Stripe-Abbuchung fehlgeschlagen";
      console.error("Stripe Verlängerungs-Abbuchung", stripeCustomerId, error);
      return { ok: false, reason: message };
    }
  }

  try {
    return await withStripeAccounts(chargeOn);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe-Abbuchung fehlgeschlagen";
    console.error("Stripe Verlängerungs-Abbuchung", stripeCustomerId, error);
    return { ok: false, reason: message };
  }
}
