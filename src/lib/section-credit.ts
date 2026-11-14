import { prisma } from "@/lib/prisma";

export async function getSectionCreditBalance(
  userId: string,
  sectionId: string | null | undefined,
) {
  if (!sectionId) return 0;
  const account = await prisma.sectionCreditAccount.findUnique({
    where: { userId_sectionId: { userId, sectionId } },
    select: { balanceCents: true },
  });
  return account?.balanceCents ?? 0;
}

export async function listSectionCreditBalances(userId: string) {
  return prisma.sectionCreditAccount.findMany({
    where: { userId, balanceCents: { gt: 0 } },
    orderBy: { section: { name: "asc" } },
    select: {
      sectionId: true,
      balanceCents: true,
      section: { select: { name: true } },
    },
  });
}

/** Gutschrift auf das Guthabenkonto einer Sektion, nur einmal pro Buchung und Text. */
export async function addSectionCreditOnce(
  userId: string,
  sectionId: string,
  amountCents: number,
  ledger: {
    description: string;
    enrollmentId?: string;
    courtReservationId?: string;
  },
) {
  if (amountCents <= 0) return 0;
  const existing = await prisma.creditTransaction.findFirst({
    where: {
      userId,
      sectionId,
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

  await prisma.$transaction(async (tx) => {
    await tx.sectionCreditAccount.upsert({
      where: { userId_sectionId: { userId, sectionId } },
      create: { userId, sectionId, balanceCents: amountCents },
      update: { balanceCents: { increment: amountCents } },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        sectionId,
        amountCents,
        kind: "REFUND",
        description: ledger.description,
        enrollmentId: ledger.enrollmentId ?? null,
        courtReservationId: ledger.courtReservationId ?? null,
      },
    });
  });
  return amountCents;
}
