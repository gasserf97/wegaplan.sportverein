import { type CreditTransactionKind } from "@/generated/prisma/client";
import { sendCourseEnrollmentConfirmations } from "@/lib/booking-confirmation";
import { enrollmentCreditRefundCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { revalidateEnrollmentViews } from "@/lib/revalidate-enrollments";
import { clearWaitlistOfferData } from "@/lib/waitlist";
import type { CreditAccountsReport } from "@/lib/credit-types";
export type {
  CreditAccountRow,
  CreditAccountsReport,
  CreditTransactionRow,
} from "@/lib/credit-types";
export {
  creditTransactionKindLabel,
  creditTransactionSignedAmount,
} from "@/lib/credit-display";

export type CreditAllocation = {
  enrollmentId: string;
  priceCents: number;
  creditCents: number;
  cardCents: number;
};

export type ItemCreditAllocation = {
  itemId: string;
  priceCents: number;
  creditCents: number;
  cardCents: number;
};

export function allocateCreditAcrossItems(
  items: { itemId: string; priceCents: number }[],
  availableCreditCents: number,
) {
  let remainingCredit = Math.max(0, availableCreditCents);
  return items.map((item) => {
    const creditCents = Math.min(remainingCredit, item.priceCents);
    remainingCredit -= creditCents;
    return {
      itemId: item.itemId,
      priceCents: item.priceCents,
      creditCents,
      cardCents: item.priceCents - creditCents,
    };
  });
}

export function allocateCreditAcrossSeats(
  enrollmentIds: string[],
  priceCentsPerSeat: number,
  availableCreditCents: number,
): CreditAllocation[] {
  return allocateCreditAcrossItems(
    enrollmentIds.map((enrollmentId) => ({
      itemId: enrollmentId,
      priceCents: priceCentsPerSeat,
    })),
    availableCreditCents,
  ).map((item) => ({
    enrollmentId: item.itemId,
    priceCents: item.priceCents,
    creditCents: item.creditCents,
    cardCents: item.cardCents,
  }));
}

export async function getCreditBalance(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalanceCents: true },
  });
  return user?.creditBalanceCents ?? 0;
}

type CreditLedger = {
  description: string;
  enrollmentId?: string;
  subscriptionId?: string;
  courtReservationId?: string;
  deviceReservationId?: string;
};

export async function addCreditBalance(
  userId: string,
  amountCents: number,
  ledger: CreditLedger,
) {
  if (amountCents <= 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { creditBalanceCents: { increment: amountCents } },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        amountCents,
        kind: "REFUND",
        description: ledger.description,
        enrollmentId: ledger.enrollmentId ?? null,
        subscriptionId: ledger.subscriptionId ?? null,
        courtReservationId: ledger.courtReservationId ?? null,
        deviceReservationId: ledger.deviceReservationId ?? null,
      },
    });
  });
}

/** Gutschrift nur, wenn dieselbe Buchung denselben Text noch nicht hat. */
export async function addCreditRefundOnce(
  userId: string,
  amountCents: number,
  ledger: CreditLedger,
) {
  if (amountCents <= 0) return 0;
  const existing = await prisma.creditTransaction.findFirst({
    where: {
      userId,
      kind: "REFUND",
      description: ledger.description,
      ...(ledger.enrollmentId ? { enrollmentId: ledger.enrollmentId } : {}),
      ...(ledger.courtReservationId
        ? { courtReservationId: ledger.courtReservationId }
        : {}),
    },
    select: { id: true },
  });
  if (existing) return 0;
  await addCreditBalance(userId, amountCents, ledger);
  return amountCents;
}

export async function spendCreditBalance(
  userId: string,
  amountCents: number,
  ledger: {
    description: string;
    enrollmentId?: string;
    subscriptionId?: string;
    courtReservationId?: string;
    deviceReservationId?: string;
  },
) {
  if (amountCents <= 0) return;
  await prisma.$transaction(async (tx) => {
    const payer = await tx.user.findUnique({
      where: { id: userId },
      select: { creditBalanceCents: true },
    });
    if (!payer || payer.creditBalanceCents < amountCents) {
      throw new Error("Nicht genug Guthaben.");
    }
    await tx.user.update({
      where: { id: userId },
      data: { creditBalanceCents: { decrement: amountCents } },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        amountCents,
        kind: "PAYMENT",
        description: ledger.description,
        enrollmentId: ledger.enrollmentId ?? null,
        subscriptionId: ledger.subscriptionId ?? null,
        courtReservationId: ledger.courtReservationId ?? null,
        deviceReservationId: ledger.deviceReservationId ?? null,
      },
    });
  });
}

export async function reserveSubscriptionCreditForBankTransfer(
  payerUserId: string,
  allocations: ItemCreditAllocation[],
  planTitle: string,
) {
  for (const allocation of allocations) {
    if (allocation.creditCents <= 0) continue;
    await spendCreditBalance(payerUserId, allocation.creditCents, {
      description: `Mitgliedschaft (Überweisung ausstehend): ${planTitle}`,
      subscriptionId: allocation.itemId,
    });
  }
}

export async function finalizeSubscriptionPayments(
  payerUserId: string,
  subscriptionIds: string[],
) {
  const subscriptions = await prisma.subscription.findMany({
    where: { id: { in: subscriptionIds } },
    select: {
      id: true,
      paidCents: true,
      creditAppliedCents: true,
      plan: { select: { title: true, priceCents: true } },
      user: { select: { name: true } },
    },
  });

  await prisma.$transaction(async (tx) => {
    const existingPayments = await tx.creditTransaction.findMany({
      where: {
        subscriptionId: { in: subscriptionIds },
        kind: "PAYMENT",
      },
      select: { subscriptionId: true },
    });
    const alreadyReserved = new Set(
      existingPayments
        .map((item) => item.subscriptionId)
        .filter((id): id is string => Boolean(id)),
    );

    const needingDeduction = subscriptions.filter(
      (item) => item.creditAppliedCents > 0 && !alreadyReserved.has(item.id),
    );
    const totalCredit = needingDeduction.reduce(
      (sum, item) => sum + item.creditAppliedCents,
      0,
    );

    if (totalCredit > 0) {
      const payer = await tx.user.findUnique({
        where: { id: payerUserId },
        select: { creditBalanceCents: true },
      });
      if (!payer || payer.creditBalanceCents < totalCredit) {
        throw new Error("Nicht genug Guthaben.");
      }
      await tx.user.update({
        where: { id: payerUserId },
        data: { creditBalanceCents: { decrement: totalCredit } },
      });

      for (const subscription of needingDeduction) {
        await tx.creditTransaction.create({
          data: {
            userId: payerUserId,
            amountCents: subscription.creditAppliedCents,
            kind: "PAYMENT",
            description: `Mitgliedschaft: ${subscription.plan.title} (${subscription.user.name})`,
            subscriptionId: subscription.id,
          },
        });
      }
    }
  });
}

export async function finalizeCourtReservationPayment(
  payerUserId: string,
  reservationId: string,
) {
  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
    select: {
      creditAppliedCents: true,
      court: { select: { name: true } },
    },
  });
  if (!reservation || reservation.creditAppliedCents <= 0) return;

  const existing = await prisma.creditTransaction.findFirst({
    where: { courtReservationId: reservationId, kind: "PAYMENT" },
    select: { id: true },
  });
  if (existing) return;

  await spendCreditBalance(payerUserId, reservation.creditAppliedCents, {
    description: `Tennisplatz: ${reservation.court.name}`,
    courtReservationId: reservationId,
  });
}

export async function finalizeDeviceReservationPayment(
  payerUserId: string,
  reservationId: string,
) {
  const reservation = await prisma.deviceReservation.findUnique({
    where: { id: reservationId },
    select: {
      creditAppliedCents: true,
      device: { select: { name: true } },
    },
  });
  if (!reservation || reservation.creditAppliedCents <= 0) return;

  const existing = await prisma.creditTransaction.findFirst({
    where: { deviceReservationId: reservationId, kind: "PAYMENT" },
    select: { id: true },
  });
  if (existing) return;

  await spendCreditBalance(payerUserId, reservation.creditAppliedCents, {
    description: `Fuhrpark: ${reservation.device.name}`,
    deviceReservationId: reservationId,
  });
}

export async function reserveCourseCreditForBankTransfer(
  payerUserId: string,
  allocations: CreditAllocation[],
  courseTitle: string,
) {
  for (const allocation of allocations) {
    if (allocation.creditCents <= 0) continue;
    await spendCreditBalance(payerUserId, allocation.creditCents, {
      description: `Kursbuchung (Überweisung ausstehend): ${courseTitle}`,
      enrollmentId: allocation.enrollmentId,
    });
  }
}

export async function finalizeCourseEnrollmentPayments(
  payerUserId: string,
  enrollmentIds: string[],
) {
  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    select: {
      id: true,
      courseId: true,
      paidCents: true,
      creditAppliedCents: true,
      course: { select: { title: true, priceCents: true } },
      user: { select: { name: true } },
    },
  });

  await prisma.$transaction(async (tx) => {
    const existingPayments = await tx.creditTransaction.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        kind: "PAYMENT",
      },
      select: { enrollmentId: true },
    });
    const alreadyReserved = new Set(
      existingPayments
        .map((item) => item.enrollmentId)
        .filter((id): id is string => Boolean(id)),
    );

    const enrollmentsNeedingDeduction = enrollments.filter(
      (item) => item.creditAppliedCents > 0 && !alreadyReserved.has(item.id),
    );
    const totalCredit = enrollmentsNeedingDeduction.reduce(
      (sum, item) => sum + item.creditAppliedCents,
      0,
    );

    if (totalCredit > 0) {
      const payer = await tx.user.findUnique({
        where: { id: payerUserId },
        select: { creditBalanceCents: true },
      });
      if (!payer || payer.creditBalanceCents < totalCredit) {
        throw new Error("Nicht genug Guthaben.");
      }
      await tx.user.update({
        where: { id: payerUserId },
        data: { creditBalanceCents: { decrement: totalCredit } },
      });

      for (const enrollment of enrollmentsNeedingDeduction) {
        await tx.creditTransaction.create({
          data: {
            userId: payerUserId,
            amountCents: enrollment.creditAppliedCents,
            kind: "PAYMENT",
            description: `Kursbuchung: ${enrollment.course.title} (${enrollment.user.name})`,
            enrollmentId: enrollment.id,
          },
        });
      }
    }

    const now = new Date();
    for (const enrollment of enrollments) {
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: "PAID",
          paidAt: now,
          paidCents: enrollment.paidCents ?? enrollment.course.priceCents,
          ...clearWaitlistOfferData(),
        },
      });
    }
  });

  await sendCourseEnrollmentConfirmations(enrollmentIds);
  const { grantBundledPlansForPaidEnrollments } = await import(
    "@/lib/course-bundled-plan"
  );
  await grantBundledPlansForPaidEnrollments(enrollmentIds);
  revalidateEnrollmentViews(
    enrollments.map((item) => item.courseId).filter(Boolean),
  );
}

export function creditRefundAmount(enrollment: {
  paidCents: number | null;
  creditAppliedCents: number;
  course: { priceCents: number };
}) {
  return enrollmentCreditRefundCents(enrollment);
}

export async function getCreditTransactions(userId: string) {
  return prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      kind: true,
      description: true,
      enrollmentId: true,
      createdAt: true,
    },
  });
}

export async function loadCreditAccountsReport(): Promise<CreditAccountsReport> {
  const users = await prisma.user.findMany({
    where: { creditBalanceCents: { gt: 0 } },
    orderBy: [{ creditBalanceCents: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      creditBalanceCents: true,
      creditTransactions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amountCents: true,
          kind: true,
          description: true,
          enrollmentId: true,
          createdAt: true,
        },
      },
    },
  });

  const totalCreditCents = users.reduce(
    (sum, user) => sum + user.creditBalanceCents,
    0,
  );

  return {
    totalCreditCents,
    accounts: users.map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      creditBalanceCents: user.creditBalanceCents,
      transactions: user.creditTransactions,
    })),
  };
}
