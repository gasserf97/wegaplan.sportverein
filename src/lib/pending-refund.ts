import type { PendingRefundKind, PaymentMethod } from "@/generated/prisma/client";
import { spendCreditBalance } from "@/lib/credit";
import { getSectionCreditBalance } from "@/lib/section-credit";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { resolveStripeFeeCents } from "@/lib/stripe-fees";

export type PendingRefundRow = {
  id: string;
  kind: PendingRefundKind;
  title: string;
  sectionId: string | null;
  memberName: string;
  payerName: string | null;
  paymentMethod: PaymentMethod | null;
  externalCents: number;
  stripeFeeCents: number;
  payoutCents: number;
  creditedCents: number;
  createdAt: Date;
  enrollmentId: string | null;
  deviceReservationId: string | null;
  subscriptionId: string | null;
};

/** Betrag, der nach Storno zurücküberwiesen werden soll. */
export function cashRefundPayoutCents(input: {
  paymentMethod: PaymentMethod | null | undefined;
  externalCents: number;
  stripeFeeCents?: number | null;
  stripeSessionId?: string | null;
}): { payoutCents: number; feeCents: number; estimated: boolean } {
  const external = Math.max(0, input.externalCents);
  if (external <= 0) {
    return { payoutCents: 0, feeCents: 0, estimated: false };
  }

  const isStripe =
    input.paymentMethod === "STRIPE" || Boolean(input.stripeSessionId);

  if (!isStripe) {
    return { payoutCents: external, feeCents: 0, estimated: false };
  }

  const { feeCents, estimated } = resolveStripeFeeCents(
    external,
    input.stripeFeeCents,
  );
  return {
    payoutCents: Math.max(0, external - feeCents),
    feeCents,
    estimated,
  };
}

export async function getPendingRefundHoldCents(userId: string) {
  const rows = await prisma.pendingRefundTransfer.findMany({
    where: { userId, status: "PENDING" },
    select: { creditedCents: true },
  });
  return rows.reduce((sum, row) => sum + Math.max(0, row.creditedCents), 0);
}

/** Für Tennisplätze nutzbares Guthaben (ohne offene Rücküberweisungen), plus Sektionsguthaben. */
export async function getSpendableCourtCreditCents(
  userId: string,
  sectionId?: string | null,
) {
  const [balance, hold, sectionCredit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalanceCents: true },
    }),
    getPendingRefundHoldCents(userId),
    getSectionCreditBalance(userId, sectionId),
  ]);
  return (
    Math.max(0, (balance?.creditBalanceCents ?? 0) - hold) + sectionCredit
  );
}

export async function createPendingRefundTransfer(input: {
  userId: string;
  kind: PendingRefundKind;
  title: string;
  sectionId?: string | null;
  memberName: string;
  payerName?: string | null;
  paymentMethod?: PaymentMethod | null;
  externalCents: number;
  stripeFeeCents?: number | null;
  stripeSessionId?: string | null;
  creditedCents: number;
  enrollmentId?: string | null;
  deviceReservationId?: string | null;
  subscriptionId?: string | null;
  courtReservationId?: string | null;
}) {
  const external = Math.max(0, input.externalCents);
  // Nur wenn tatsächlich Geld zurücküberwiesen werden muss.
  if (external <= 0) return null;

  const { payoutCents, feeCents } = cashRefundPayoutCents({
    paymentMethod: input.paymentMethod,
    externalCents: external,
    stripeFeeCents: input.stripeFeeCents,
    stripeSessionId: input.stripeSessionId,
  });

  if (payoutCents <= 0) return null;

  return prisma.pendingRefundTransfer.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      sectionId: input.sectionId ?? null,
      memberName: input.memberName,
      payerName: input.payerName ?? null,
      paymentMethod: input.paymentMethod ?? null,
      externalCents: external,
      stripeFeeCents: feeCents,
      payoutCents,
      creditedCents: Math.max(0, input.creditedCents),
      enrollmentId: input.enrollmentId ?? null,
      deviceReservationId: input.deviceReservationId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      courtReservationId: input.courtReservationId ?? null,
    },
  });
}

export async function loadPendingRefundTransfers(sectionIds: string[] | null) {
  const rows = await prisma.pendingRefundTransfer.findMany({
    where: {
      status: "PENDING",
      ...(sectionIds
        ? {
            OR: [
              { sectionId: { in: sectionIds } },
              { sectionId: null },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!sectionIds) return rows;

  // Ohne Sektion nur für globale Admins (sectionIds === null). Mit Filter:
  // null-Sektion ausblenden, außer die Liste ist leer-Filter... actually for
  // section managers we only show matching sectionIds.
  return rows.filter(
    (row) => row.sectionId != null && sectionIds.includes(row.sectionId),
  );
}

export async function loadConfirmedCashRefundKeys() {
  const rows = await prisma.pendingRefundTransfer.findMany({
    where: { status: "CONFIRMED" },
    select: {
      enrollmentId: true,
      deviceReservationId: true,
      subscriptionId: true,
      courtReservationId: true,
    },
  });

  return {
    enrollmentIds: new Set(
      rows.map((row) => row.enrollmentId).filter(Boolean) as string[],
    ),
    deviceReservationIds: new Set(
      rows
        .map((row) => row.deviceReservationId)
        .filter(Boolean) as string[],
    ),
    subscriptionIds: new Set(
      rows.map((row) => row.subscriptionId).filter(Boolean) as string[],
    ),
    courtReservationIds: new Set(
      rows.map((row) => row.courtReservationId).filter(Boolean) as string[],
    ),
  };
}

export async function confirmPendingRefundTransfer(
  transferId: string,
  confirmedById: string,
) {
  const transfer = await prisma.pendingRefundTransfer.findUnique({
    where: { id: transferId },
  });
  if (!transfer) return { error: "Eintrag nicht gefunden." as const };
  if (transfer.status !== "PENDING") {
    return { error: "Diese Rücküberweisung wurde bereits bestätigt." as const };
  }

  if (transfer.creditedCents > 0) {
    const balance = await prisma.user.findUnique({
      where: { id: transfer.userId },
      select: { creditBalanceCents: true },
    });
    const clearCents = Math.min(
      transfer.creditedCents,
      balance?.creditBalanceCents ?? 0,
    );
    if (clearCents > 0) {
      await spendCreditBalance(transfer.userId, clearCents, {
        description: `Rücküberweisung bestätigt: ${transfer.title}`,
        enrollmentId: transfer.enrollmentId ?? undefined,
        deviceReservationId: transfer.deviceReservationId ?? undefined,
        subscriptionId: transfer.subscriptionId ?? undefined,
        courtReservationId: transfer.courtReservationId ?? undefined,
      });
    }
  }

  await prisma.pendingRefundTransfer.update({
    where: { id: transferId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById,
    },
  });

  return { ok: true as const, payoutCents: transfer.payoutCents };
}

export function enrollmentExternalForRefund(enrollment: {
  paidCents: number | null;
  creditAppliedCents: number;
  course: { priceCents: number };
}) {
  return externalPaymentDueCents(
    enrollment.paidCents,
    enrollment.course.priceCents,
    enrollment.creditAppliedCents,
    false,
  );
}
