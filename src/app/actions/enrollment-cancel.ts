"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { canActFor } from "@/lib/family";
import {
  canCancelCourseEnrollment,
  courseCancelBlockedMessage,
} from "@/lib/courses";
import {
  addCreditBalance,
  creditRefundAmount,
  restoreSpentCredit,
} from "@/lib/credit";
import { settleFailedCardRefund } from "@/lib/failed-refund";
import {
  cashRefundPayoutCents,
  createPendingRefundTransfer,
  enrollmentExternalForRefund,
} from "@/lib/pending-refund";
import { prisma } from "@/lib/prisma";
import {
  fetchStripeFeeFromCheckoutSession,
  resolveStripeFeeCents,
} from "@/lib/stripe-fees";
import {
  cardRefundAmountCents,
  refundStripeCheckoutSession,
} from "@/lib/stripe-refund";
import { deleteStoredFile } from "@/lib/uploads";
import {
  clearWaitlistOfferData,
  tryPromoteWaitlistAfterCancellation,
} from "@/lib/waitlist";

export async function cancelEnrollmentAction(
  enrollmentId: string,
): Promise<
  | { error: string }
  | {
      ok: true;
      creditedCents: number;
      cardRefundCreditedCents: number;
      pendingRefundCents: number;
    }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Bitte melden Sie sich an." };

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          priceCents: true,
          startsAt: true,
          cancelDeadlineDaysBeforeStart: true,
          sectionId: true,
        },
      },
      user: { select: { name: true } },
      purchasedBy: { select: { name: true } },
      documents: true,
    },
  });

  if (!enrollment) return { error: "Anmeldung nicht gefunden." };

  const allowed =
    (await canActFor(user.id, enrollment.userId)) ||
    enrollment.purchasedById === user.id ||
    user.role === "ADMIN";

  if (!allowed) return { error: "Keine Berechtigung." };

  if (enrollment.status === "CANCELLED") {
    return { error: "Diese Anmeldung ist bereits zurückgenommen." };
  }

  if (
    enrollment.status !== "WAITLISTED" &&
    user.role !== "ADMIN" &&
    !canCancelCourseEnrollment(
      enrollment.course.startsAt,
      enrollment.course.cancelDeadlineDaysBeforeStart,
    )
  ) {
    return {
      error: courseCancelBlockedMessage(
        enrollment.course.cancelDeadlineDaysBeforeStart,
        enrollment.course.startsAt,
      ),
    };
  }

  const creditRecipientId = enrollment.purchasedById ?? enrollment.userId;
  let creditedCents = 0;
  let cardRefundCreditedCents = 0;
  let pendingRefundCents = 0;
  let cardRefunded = false;
  const wasPaid = enrollment.status === "PAID";
  const paidByCard =
    wasPaid &&
    (enrollment.paymentMethod === "STRIPE" ||
      (enrollment.paymentMethod !== "BANK_TRANSFER" &&
        Boolean(enrollment.stripeSessionId)));

  const freedSpot =
    enrollment.status === "PAID" || enrollment.status === "PENDING";

  if (paidByCard) {
    const externalCents = enrollmentExternalForRefund(enrollment);
    if (externalCents > 0) {
      try {
        if (!enrollment.stripeSessionId) {
          throw new Error("Keine Stripe-Zahlung zur Erstattung gefunden.");
        }
        const storedFee =
          enrollment.stripeFeeCents ??
          (await fetchStripeFeeFromCheckoutSession(enrollment.stripeSessionId));
        const { feeCents } = resolveStripeFeeCents(externalCents, storedFee);
        const payout = cashRefundPayoutCents({
          paymentMethod: "STRIPE",
          externalCents,
          stripeFeeCents: feeCents,
          stripeSessionId: enrollment.stripeSessionId,
        });
        const refundCents = cardRefundAmountCents(
          externalCents,
          payout.payoutCents,
        );
        if (refundCents > 0) {
          await refundStripeCheckoutSession({
            sessionId: enrollment.stripeSessionId,
            amountCents: refundCents,
            sectionId: enrollment.course.sectionId,
            idempotencyKey: `course-refund-v2-${enrollment.id}-${refundCents}`,
          });
          cardRefunded = true;
        }
      } catch (error) {
        console.error("Kurs-Kartenerstattung", enrollment.id, error);
        const { feeCents } = resolveStripeFeeCents(
          externalCents,
          enrollment.stripeFeeCents,
        );
        const payout = cashRefundPayoutCents({
          paymentMethod: "STRIPE",
          externalCents,
          stripeFeeCents: feeCents,
          stripeSessionId: enrollment.stripeSessionId,
        });
        const refundCents = cardRefundAmountCents(
          externalCents,
          payout.payoutCents,
        );
        const settled = await settleFailedCardRefund({
          sectionId: enrollment.course.sectionId,
          userId: creditRecipientId,
          creditCents: refundCents,
          creditDescription: `Stornierung (Kartenerstattung fehlgeschlagen): ${enrollment.course.title}`,
          enrollmentId: enrollment.id,
          pending: {
            kind: "COURSE",
            title: enrollment.course.title,
            memberName: enrollment.user.name,
            payerName: enrollment.purchasedBy?.name ?? null,
            externalCents,
            stripeFeeCents: feeCents,
            stripeSessionId: enrollment.stripeSessionId,
          },
        });
        cardRefundCreditedCents += settled.creditedCents;
        creditedCents += settled.creditedCents;
        pendingRefundCents += settled.pendingRefundCents;
      }
    }

    if (enrollment.creditAppliedCents > 0) {
      const added = await restoreSpentCredit(
        creditRecipientId,
        enrollment.creditAppliedCents,
        {
          description: `Stornierung (Guthabenanteil): ${enrollment.course.title}`,
          enrollmentId: enrollment.id,
        },
      );
      creditedCents += added;
    }
  } else if (wasPaid) {
    creditedCents = creditRefundAmount(enrollment);
    await addCreditBalance(creditRecipientId, creditedCents, {
      description: `Stornierung: ${enrollment.course.title}`,
      enrollmentId: enrollment.id,
    });

    const externalCents = enrollmentExternalForRefund(enrollment);
    await createPendingRefundTransfer({
      userId: creditRecipientId,
      kind: "COURSE",
      title: enrollment.course.title,
      sectionId: enrollment.course.sectionId,
      memberName: enrollment.user.name,
      payerName: enrollment.purchasedBy?.name ?? null,
      paymentMethod: enrollment.paymentMethod,
      externalCents,
      stripeFeeCents: enrollment.stripeFeeCents,
      stripeSessionId: enrollment.stripeSessionId,
      creditedCents,
      enrollmentId: enrollment.id,
    });
  } else if (
    enrollment.status === "PENDING" &&
    enrollment.paymentMethod === "BANK_TRANSFER" &&
    enrollment.creditAppliedCents > 0
  ) {
    const reservedCredit = await prisma.creditTransaction.findFirst({
      where: { enrollmentId: enrollment.id, kind: "PAYMENT" },
    });
    if (reservedCredit) {
      creditedCents = enrollment.creditAppliedCents;
      await addCreditBalance(creditRecipientId, creditedCents, {
        description: `Stornierung: ${enrollment.course.title}`,
        enrollmentId: enrollment.id,
      });
    }
  }

  for (const doc of enrollment.documents) {
    await deleteStoredFile(doc.storageKey);
  }
  if (enrollment.documents.length > 0) {
    await prisma.enrollmentDocument.deleteMany({
      where: { enrollmentId: enrollment.id },
    });
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "CANCELLED",
      attestConfirmedAt: null,
      ...clearWaitlistOfferData(),
      ...(wasPaid
        ? {
            creditAppliedCents: enrollment.creditAppliedCents,
            ...(cardRefunded ? { cardRefundedAt: new Date() } : {}),
          }
        : {
            creditAppliedCents: 0,
            paidCents: null,
            paymentMethod: null,
            paymentReference: null,
            bankTransferGroupId: null,
            bankTransferApprovedAt: null,
            bankTransferApprovedById: null,
            stripeSessionId: null,
            paidAt: null,
          }),
    },
  });

  if (freedSpot) {
    await tryPromoteWaitlistAfterCancellation(enrollment.course.id);
  }

  revalidatePath("/konto");
  revalidatePath(`/kurse/${enrollment.course.id}`);
  revalidatePath(`/admin/kurse/${enrollment.course.id}/anmeldungen`);
  revalidatePath("/admin");
  revalidatePath("/admin/buchhaltung");

  return { ok: true, creditedCents, cardRefundCreditedCents, pendingRefundCents };
}
