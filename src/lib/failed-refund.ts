import type { PendingRefundKind } from "@/generated/prisma/client";
import { createPendingRefundTransfer } from "@/lib/pending-refund";
import { prisma } from "@/lib/prisma";
import { addSectionCreditOnce } from "@/lib/section-credit";

/** true = fehlgeschlagene Kartenerstattung geht auf das Guthaben dieser Sektion. */
export async function sectionAllowsCredit(sectionId: string | null | undefined) {
  if (!sectionId) return false;
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { creditAllowed: true },
  });
  return section?.creditAllowed ?? false;
}

/**
 * Kartenerstattung ist fehlgeschlagen.
 * Guthaben möglich: Betrag auf das Guthabenkonto dieser Sektion.
 * Sonst: Eintrag unter Zurückzuweisende Überweisungen, ohne Guthaben.
 */
export async function settleFailedCardRefund(input: {
  sectionId: string | null;
  userId: string;
  creditCents: number;
  creditDescription: string;
  enrollmentId?: string;
  courtReservationId?: string;
  pending: {
    kind: Extract<PendingRefundKind, "COURSE" | "COURT">;
    title: string;
    memberName: string;
    payerName?: string | null;
    externalCents: number;
    stripeFeeCents?: number | null;
    stripeSessionId?: string | null;
  };
}): Promise<{ creditedCents: number; pendingRefundCents: number }> {
  const creditCents = Math.max(0, Math.trunc(input.creditCents));
  if (creditCents <= 0 && input.pending.externalCents <= 0) {
    return { creditedCents: 0, pendingRefundCents: 0 };
  }

  if (input.sectionId && (await sectionAllowsCredit(input.sectionId))) {
    if (creditCents <= 0) return { creditedCents: 0, pendingRefundCents: 0 };
    const creditedCents = await addSectionCreditOnce(
      input.userId,
      input.sectionId,
      creditCents,
      {
        description: input.creditDescription,
        enrollmentId: input.enrollmentId,
        courtReservationId: input.courtReservationId,
      },
    );
    return { creditedCents, pendingRefundCents: 0 };
  }

  const link =
    input.enrollmentId != null
      ? { enrollmentId: input.enrollmentId }
      : input.courtReservationId != null
        ? { courtReservationId: input.courtReservationId }
        : null;
  if (link) {
    const existing = await prisma.pendingRefundTransfer.findFirst({
      where: { status: "PENDING", ...link },
      select: { payoutCents: true },
    });
    if (existing) {
      return { creditedCents: 0, pendingRefundCents: existing.payoutCents };
    }
  }

  const created = await createPendingRefundTransfer({
    userId: input.userId,
    kind: input.pending.kind,
    title: input.pending.title,
    sectionId: input.sectionId,
    memberName: input.pending.memberName,
    payerName: input.pending.payerName,
    paymentMethod: "STRIPE",
    externalCents: input.pending.externalCents,
    stripeFeeCents: input.pending.stripeFeeCents,
    stripeSessionId: input.pending.stripeSessionId,
    creditedCents: 0,
    enrollmentId: input.enrollmentId,
    courtReservationId: input.courtReservationId,
  });

  return {
    creditedCents: 0,
    pendingRefundCents: created?.payoutCents ?? 0,
  };
}
