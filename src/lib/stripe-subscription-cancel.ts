import { prisma } from "@/lib/prisma";
import { withStripeAccounts } from "@/lib/stripe";
import { recordSubscriptionPayment } from "@/lib/subscription-payments";
import type { Prisma } from "@/generated/prisma/client";
import type Stripe from "stripe";

function isStripeSubscriptionGone(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already (been )?cancel|resource_missing|no such subscription/i.test(
    message,
  );
}

async function resolveStripeSubscriptionId(subscription: {
  id: string;
  stripeSubscriptionId: string | null;
  stripeSessionId: string | null;
}) {
  if (subscription.stripeSubscriptionId) return subscription.stripeSubscriptionId;
  if (!subscription.stripeSessionId) return null;

  try {
    const stripeSubId = await withStripeAccounts(async (stripe) => {
      const session = await stripe.checkout.sessions.retrieve(
        subscription.stripeSessionId!,
      );
      const sub = session.subscription;
      if (typeof sub === "string") return sub;
      if (sub && typeof sub === "object" && "id" in sub) return sub.id;
      return null;
    });
    if (stripeSubId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripeSubscriptionId: stripeSubId },
      });
    }
    return stripeSubId;
  } catch (error) {
    console.error("Stripe-Abo-ID aus Checkout", subscription.id, error);
    return null;
  }
}

function periodFromStripeSubscription(sub: {
  current_period_end?: number | null;
  current_period_start?: number | null;
  items?: {
    data?: Array<{
      current_period_end?: number | null;
      current_period_start?: number | null;
    }>;
  };
}) {
  const item = sub.items?.data?.[0];
  const end = sub.current_period_end ?? item?.current_period_end ?? null;
  const start = sub.current_period_start ?? item?.current_period_start ?? null;
  return {
    periodStart: start ? new Date(start * 1000) : null,
    periodEnd: end ? new Date(end * 1000) : null,
  };
}

const stripeRecurringSelect = {
  id: true,
  autoRenew: true,
  periodEnd: true,
  stripeSubscriptionId: true,
  stripeSessionId: true,
} as const;

/** Keep current paid period; stop further Stripe invoices so local prepaid renew can run. */
export async function deferStripeRecurringForPrepaidRenewal(subscription: {
  id: string;
  stripeSubscriptionId: string | null;
  stripeSessionId: string | null;
}) {
  const stripeSubId = await resolveStripeSubscriptionId(subscription);
  if (!stripeSubId) return;

  await withStripeAccounts(async (stripe) => {
    await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    });
  }).catch((error) => {
    if (isStripeSubscriptionGone(error)) return;
    throw error;
  });
}

/** Local autoRenew=false: stop Stripe billing immediately (no further invoices). */
export async function syncStripeRecurringToLocalAutoRenew(
  subscription: {
    id: string;
    autoRenew: boolean;
    periodEnd: Date | null;
    stripeSubscriptionId: string | null;
    stripeSessionId: string | null;
  },
  _now = new Date(),
) {
  const stripeSubId = await resolveStripeSubscriptionId(subscription);
  if (!stripeSubId) {
    // Einmalzahlung (Checkout mode=payment) speichert nur stripeSessionId –
    // es gibt kein Stripe-Abo zum Kündigen. IDs leeren, damit Konto-Löschen
    // und Cron nicht an dieser Sicherheitsprüfung hängen bleiben.
    if (
      !subscription.autoRenew &&
      (subscription.stripeSubscriptionId || subscription.stripeSessionId)
    ) {
      await clearLocalStripeRecurringIds(subscription.id);
    }
    return;
  }

  let cancelledOrGone = false;
  try {
    await withStripeAccounts(async (stripe) => {
      if (subscription.autoRenew) {
        await stripe.subscriptions.update(stripeSubId, {
          cancel_at_period_end: false,
        });
        return;
      }

      const remote = await stripe.subscriptions.retrieve(stripeSubId);
      if (remote.status === "canceled" || remote.status === "incomplete_expired") {
        cancelledOrGone = true;
        return;
      }
      await stripe.subscriptions.cancel(stripeSubId);
      cancelledOrGone = true;
    });
  } catch (error) {
    if (!isStripeSubscriptionGone(error)) throw error;
    cancelledOrGone = true;
  }

  // IDs erst leeren, wenn Cancel bestätigt oder Abo bei Stripe bereits weg ist.
  if (!subscription.autoRenew && cancelledOrGone) {
    await clearLocalStripeRecurringIds(subscription.id);
  }
}

/** Sofort kündigen, wenn lokal kein Abo mehr zur Stripe-ID passt (verwaiste Recurring). */
export async function cancelOrphanStripeSubscription(
  stripeSubscriptionId: string,
) {
  try {
    await withStripeAccounts(async (stripe) => {
      const remote = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (remote.status === "canceled" || remote.status === "incomplete_expired") {
        return;
      }
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      console.warn(
        "Verwaiste Stripe-Abo gekündigt (keine lokale Zeile)",
        stripeSubscriptionId,
      );
    });
  } catch (error) {
    if (isStripeSubscriptionGone(error)) return;
    throw error;
  }
}

async function clearLocalStripeRecurringIds(subscriptionId: string) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      stripeSubscriptionId: null,
      stripeSessionId: null,
    },
  });
}

/**
 * Cancel Stripe recurring whenever local auto-renew is off
 * (including while the paid period is still valid).
 */
export async function stopEndedStripeRecurring(now = new Date()) {
  const rows = await prisma.subscription.findMany({
    where: {
      autoRenew: false,
      OR: [
        { stripeSubscriptionId: { not: null } },
        { stripeSessionId: { not: null } },
      ],
    },
    select: {
      id: true,
      autoRenew: true,
      periodEnd: true,
      stripeSubscriptionId: true,
      stripeSessionId: true,
    },
  });

  let stopped = 0;
  for (const row of rows) {
    try {
      await syncStripeRecurringToLocalAutoRenew(row, now);
      stopped += 1;
    } catch (error) {
      if (isStripeSubscriptionGone(error)) {
        await clearLocalStripeRecurringIds(row.id);
        continue;
      }
      console.error("Stripe-Abo nach Periodenende", row.id, error);
    }
  }

  stopped += await stopStaleStripeRecurring(now);
  return stopped;
}

/**
 * Local period stuck in the past while Stripe still bills (missed webhooks).
 * After 36h of stale periodEnd, force-cancel Stripe and clear autoRenew.
 */
async function stopStaleStripeRecurring(now = new Date()) {
  const staleBefore = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const rows = await prisma.subscription.findMany({
    where: {
      periodEnd: { lte: staleBefore },
      OR: [
        { stripeSubscriptionId: { not: null } },
        { stripeSessionId: { not: null } },
      ],
    },
    select: stripeRecurringSelect,
  });

  let stopped = 0;
  for (const row of rows) {
    try {
      if (row.autoRenew) {
        const synced = await applyStripePeriodToLocal(row);
        if (synced) {
          const updated = await prisma.subscription.findUnique({
            where: { id: row.id },
            select: { periodEnd: true },
          });
          if (updated?.periodEnd && updated.periodEnd > now) {
            continue;
          }
        }
        await prisma.subscription.update({
          where: { id: row.id },
          data: { autoRenew: false },
        });
      }
      await syncStripeRecurringToLocalAutoRenew(
        { ...row, autoRenew: false },
        now,
      );
      stopped += 1;
    } catch (error) {
      if (isStripeSubscriptionGone(error)) {
        await clearLocalStripeRecurringIds(row.id);
        continue;
      }
      console.error("Stripe-Abo nach veralteter Periode", row.id, error);
    }
  }
  return stopped;
}

async function applyStripePeriodToLocal(row: {
  id: string;
  stripeSubscriptionId: string | null;
  stripeSessionId: string | null;
}) {
  const stripeSubId = await resolveStripeSubscriptionId(row);
  if (!stripeSubId) return false;

  const synced = await withStripeAccounts(async (stripe) => {
    const sub = await stripe.subscriptions.retrieve(stripeSubId);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      await prisma.subscription.update({
        where: { id: row.id },
        data: {
          autoRenew: false,
          stripeSubscriptionId: null,
          stripeSessionId: null,
        },
      });
      return false;
    }
    if (sub.cancel_at_period_end) {
      await prisma.subscription.update({
        where: { id: row.id },
        data: { autoRenew: false },
      });
      await stripe.subscriptions.cancel(stripeSubId);
      await clearLocalStripeRecurringIds(row.id);
      return false;
    }
    if (
      sub.status !== "active" &&
      sub.status !== "trialing" &&
      sub.status !== "past_due"
    ) {
      return false;
    }
    const { periodStart, periodEnd } = periodFromStripeSubscription(sub);
    if (!periodEnd) return false;
    await prisma.subscription.update({
      where: { id: row.id },
      data: {
        status: "ACTIVE",
        periodStart: periodStart ?? undefined,
        periodEnd,
        stripeSubscriptionId: stripeSubId,
      },
    });
    return true;
  });
  return Boolean(synced);
}

/** Webhook can miss invoice.paid – pull current Stripe period into our rows. */
export async function syncActiveStripeRecurringPeriods(userIds?: string[]) {
  const rows = await prisma.subscription.findMany({
    where: {
      autoRenew: true,
      status: "ACTIVE",
      ...(userIds ? { userId: { in: userIds } } : {}),
      OR: [
        { stripeSubscriptionId: { not: null } },
        { stripeSessionId: { not: null } },
      ],
    },
    select: stripeRecurringSelect,
  });

  let synced = 0;
  for (const row of rows) {
    try {
      if (await applyStripePeriodToLocal(row)) synced += 1;
    } catch (error) {
      if (isStripeSubscriptionGone(error)) continue;
      console.error("Stripe-Periode abgleichen", row.id, error);
    }
  }
  return synced;
}

function invoicePaidAt(invoice: Stripe.Invoice) {
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
  return new Date(paidAt * 1000);
}

/**
 * Pull successful Stripe cycle invoices into SubscriptionPayment so each
 * charge (daily / monthly / yearly) appears in Mein Profil → Transaktionen
 * and Admin → Abos → Letzte Transaktionen.
 */
export async function importPaidStripeInvoicePayments(scope?: {
  userId?: string;
  subscriptionWhere?: Prisma.SubscriptionWhereInput;
}) {
  const { listAllStripeSecretKeys } = await import("@/lib/section-payments");
  if ((await listAllStripeSecretKeys()).length === 0) return 0;

  const ownerFilter = scope?.userId
    ? { OR: [{ userId: scope.userId }, { purchasedById: scope.userId }] }
    : undefined;

  const rows = await prisma.subscription.findMany({
    where: {
      AND: [
        ...(ownerFilter ? [ownerFilter] : []),
        ...(scope?.subscriptionWhere ? [scope.subscriptionWhere] : []),
        {
          OR: [
            { stripeSubscriptionId: { not: null } },
            { stripeSessionId: { not: null } },
          ],
        },
      ],
    },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripeSessionId: true,
    },
  });

  let imported = 0;
  for (const row of rows) {
    try {
      imported += await importPaidInvoicesForSubscription(row);
    } catch (error) {
      if (isStripeSubscriptionGone(error)) continue;
      console.error("Stripe-Rechnungen importieren", row.id, error);
    }
  }
  return imported;
}

async function importPaidInvoicesForSubscription(row: {
  id: string;
  stripeSubscriptionId: string | null;
  stripeSessionId: string | null;
}) {
  const stripeSubId = await resolveStripeSubscriptionId(row);
  if (!stripeSubId) return 0;

  const existing = await prisma.subscriptionPayment.findMany({
    where: { subscriptionId: row.id },
    select: { stripePaymentId: true, source: true },
  });
  const knownIds = new Set(
    existing
      .map((payment) => payment.stripePaymentId)
      .filter((id): id is string => Boolean(id)),
  );
  let hasInitial = existing.some(
    (payment) =>
      payment.source === "checkout" || payment.source === "bank_transfer",
  );

  const invoices = await withStripeAccounts(async (stripe) => {
    const list: Stripe.Invoice[] = [];
    for await (const invoice of stripe.invoices.list({
      subscription: stripeSubId,
      status: "paid",
      limit: 100,
    })) {
      list.push(invoice);
      if (list.length >= 500) break;
    }
    return list;
  });

  let imported = 0;
  for (const invoice of invoices) {
    const amountCents = invoice.amount_paid ?? 0;
    if (amountCents <= 0) continue;
    if (knownIds.has(invoice.id)) continue;

    const reason = invoice.billing_reason;
    let source: "stripe_invoice" | "checkout" | null = null;
    if (
      reason === "subscription_cycle" ||
      reason === "subscription_update"
    ) {
      source = "stripe_invoice";
    } else if (reason === "subscription_create") {
      if (hasInitial) continue;
      source = "checkout";
    } else {
      continue;
    }

    await recordSubscriptionPayment({
      subscriptionId: row.id,
      amountCents,
      source,
      paidAt: invoicePaidAt(invoice),
      stripePaymentId: invoice.id,
    });
    knownIds.add(invoice.id);
    if (source === "checkout") hasInitial = true;
    imported += 1;
  }

  return imported;
}

export { isStripeSubscriptionGone };
