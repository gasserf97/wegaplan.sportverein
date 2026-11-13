import { prisma } from "@/lib/prisma";

export type SubscriptionPaymentSource =
  | "checkout"
  | "renewal"
  | "demo"
  | "stripe_invoice"
  | "bank_transfer"
  | "course_bundle";

export async function recordSubscriptionPayment(input: {
  subscriptionId: string;
  amountCents: number;
  source: SubscriptionPaymentSource;
  paidAt?: Date;
  stripePaymentId?: string | null;
  stripeFeeCents?: number | null;
}) {
  if (input.stripePaymentId) {
    const existing = await prisma.subscriptionPayment.findFirst({
      where: {
        subscriptionId: input.subscriptionId,
        stripePaymentId: input.stripePaymentId,
      },
    });
    if (existing) return existing;
  }

  return prisma.subscriptionPayment.create({
    data: {
      subscriptionId: input.subscriptionId,
      amountCents: input.amountCents,
      source: input.source,
      paidAt: input.paidAt ?? new Date(),
      stripePaymentId: input.stripePaymentId ?? null,
      stripeFeeCents: input.stripeFeeCents ?? null,
    },
  });
}
