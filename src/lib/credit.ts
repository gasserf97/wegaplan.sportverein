import { type CreditTransactionKind, type Prisma } from "@/generated/prisma/client";
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
  sectionId?: string | null;
};

/** Zieht zuerst vom Sektionsguthaben ab, den Rest vom Vereinsguthaben. */
async function drawCredit(
  tx: Prisma.TransactionClient,
  userId: string,
  amountCents: number,
  ledger: CreditLedger,
) {
  let remaining = amountCents;
  const sectionId = ledger.sectionId ?? null;
  if (sectionId && remaining > 0) {
    const account = await tx.sectionCreditAccount.findUnique({
      where: { userId_sectionId: { userId, sectionId } },
      select: { balanceCents: true },
    });
    const take = Math.min(account?.balanceCents ?? 0, remaining);
    if (take > 0) {
      await tx.sectionCreditAccount.update({
        where: { userId_sectionId: { userId, sectionId } },
        data: { balanceCents: { decrement: take } },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          sectionId,
          amountCents: take,
          kind: "PAYMENT",
          description: ledger.description,
          enrollmentId: ledger.enrollmentId ?? null,
          subscriptionId: ledger.subscriptionId ?? null,
          courtReservationId: ledger.courtReservationId ?? null,
          deviceReservationId: ledger.deviceReservationId ?? null,
        },
      });
      remaining -= take;
    }
  }

  if (remaining <= 0) return;
  const payer = await tx.user.findUnique({
    where: { id: userId },
    select: { creditBalanceCents: true },
  });
  if (!payer || payer.creditBalanceCents < remaining) {
    throw new Error("Nicht genug Guthaben.");
  }
  await tx.user.update({
    where: { id: userId },
    data: { creditBalanceCents: { decrement: remaining } },
  });
  await tx.creditTransaction.create({
    data: {
      userId,
      amountCents: remaining,
      kind: "PAYMENT",
      description: ledger.description,
      enrollmentId: ledger.enrollmentId ?? null,
      subscriptionId: ledger.subscriptionId ?? null,
      courtReservationId: ledger.courtReservationId ?? null,
      deviceReservationId: ledger.deviceReservationId ?? null,
    },
  });
}

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

/** Legt verbrauchtes Guthaben auf dasselbe Konto zurück (Sektion oder Verein). */
export async function restoreSpentCredit(
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

  const payments = await prisma.creditTransaction.findMany({
    where: {
      userId,
      kind: "PAYMENT",
      ...(ledger.enrollmentId ? { enrollmentId: ledger.enrollmentId } : {}),
      ...(ledger.courtReservationId
        ? { courtReservationId: ledger.courtReservationId }
        : {}),
      ...(ledger.subscriptionId ? { subscriptionId: ledger.subscriptionId } : {}),
      ...(ledger.deviceReservationId
        ? { deviceReservationId: ledger.deviceReservationId }
        : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (payments.length === 0) {
    await addCreditBalance(userId, amountCents, ledger);
    return amountCents;
  }

  let left = amountCents;
  await prisma.$transaction(async (tx) => {
    for (const payment of payments) {
      if (left <= 0) break;
      const take = Math.min(left, payment.amountCents);
      if (take <= 0) continue;
      if (payment.sectionId) {
        await tx.sectionCreditAccount.upsert({
          where: {
            userId_sectionId: { userId, sectionId: payment.sectionId },
          },
          create: {
            userId,
            sectionId: payment.sectionId,
            balanceCents: take,
          },
          update: { balanceCents: { increment: take } },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { creditBalanceCents: { increment: take } },
        });
      }
      await tx.creditTransaction.create({
        data: {
          userId,
          sectionId: payment.sectionId,
          amountCents: take,
          kind: "REFUND",
          description: ledger.description,
          enrollmentId: ledger.enrollmentId ?? null,
          subscriptionId: ledger.subscriptionId ?? null,
          courtReservationId: ledger.courtReservationId ?? null,
          deviceReservationId: ledger.deviceReservationId ?? null,
        },
      });
      left -= take;
    }
  });
  return amountCents - left;
}

export async function spendCreditBalance(
  userId: string,
  amountCents: number,
  ledger: CreditLedger,
) {
  if (amountCents <= 0) return;
  await prisma.$transaction(async (tx) => {
    await drawCredit(tx, userId, amountCents, ledger);
  });
}

export async function reserveSubscriptionCreditForBankTransfer(
  payerUserId: string,
  allocations: ItemCreditAllocation[],
  planTitle: string,
  sectionId?: string | null,
) {
  for (const allocation of allocations) {
    if (allocation.creditCents <= 0) continue;
    await spendCreditBalance(payerUserId, allocation.creditCents, {
      description: `Mitgliedschaft (Überweisung ausstehend): ${planTitle}`,
      subscriptionId: allocation.itemId,
      sectionId,
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
      plan: { select: { title: true, priceCents: true, sectionId: true } },
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

    for (const subscription of needingDeduction) {
      await drawCredit(tx, payerUserId, subscription.creditAppliedCents, {
        description: `Mitgliedschaft: ${subscription.plan.title} (${subscription.user.name})`,
        subscriptionId: subscription.id,
        sectionId: subscription.plan.sectionId,
      });
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
      court: { select: { name: true, sectionId: true } },
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
    sectionId: reservation.court.sectionId,
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
      device: { select: { name: true, sectionId: true } },
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
    sectionId: reservation.device.sectionId,
  });
}

export async function reserveCourseCreditForBankTransfer(
  payerUserId: string,
  allocations: CreditAllocation[],
  courseTitle: string,
  sectionId?: string | null,
) {
  for (const allocation of allocations) {
    if (allocation.creditCents <= 0) continue;
    await spendCreditBalance(payerUserId, allocation.creditCents, {
      description: `Kursbuchung (Überweisung ausstehend): ${courseTitle}`,
      enrollmentId: allocation.enrollmentId,
      sectionId,
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
      course: { select: { title: true, priceCents: true, sectionId: true } },
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

    for (const enrollment of enrollmentsNeedingDeduction) {
      await drawCredit(tx, payerUserId, enrollment.creditAppliedCents, {
        description: `Kursbuchung: ${enrollment.course.title} (${enrollment.user.name})`,
        enrollmentId: enrollment.id,
        sectionId: enrollment.course.sectionId,
      });
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
        where: { sectionId: null },
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
  const sectionAccounts = await prisma.sectionCreditAccount.findMany({
    where: { balanceCents: { gt: 0 } },
    orderBy: [{ balanceCents: "desc" }, { user: { name: "asc" } }],
    select: {
      balanceCents: true,
      section: { select: { id: true, name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          creditTransactions: {
            where: { sectionId: { not: null } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              amountCents: true,
              kind: true,
              description: true,
              enrollmentId: true,
              createdAt: true,
              sectionId: true,
            },
          },
        },
      },
    },
  });

  const globalCents = users.reduce(
    (sum, user) => sum + user.creditBalanceCents,
    0,
  );
  const sectionCents = sectionAccounts.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );

  return {
    totalCreditCents: globalCents + sectionCents,
    accounts: [
      ...users.map((user) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        sectionName: null,
        creditBalanceCents: user.creditBalanceCents,
        transactions: user.creditTransactions,
      })),
      ...sectionAccounts.map((account) => ({
        userId: account.user.id,
        name: account.user.name,
        email: account.user.email,
        username: account.user.username,
        sectionName: account.section.name,
        creditBalanceCents: account.balanceCents,
        transactions: account.user.creditTransactions
          .filter((item) => item.sectionId === account.section.id)
          .map(({ sectionId: _sectionId, ...item }) => item),
      })),
    ],
  };
}
