"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { canActFor } from "@/lib/family";
import { addCreditBalance } from "@/lib/credit";
import { cancelledSubscriptionData } from "@/lib/expire-pending";
import { prisma } from "@/lib/prisma";

export async function cancelPendingSubscriptionAction(
  subscriptionId: string,
): Promise<{ error: string } | { ok: true; creditedCents: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Bitte melden Sie sich an." };

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: { select: { id: true, title: true } } },
  });

  if (!subscription) return { error: "Mitgliedschaft nicht gefunden." };

  const allowed =
    (await canActFor(user.id, subscription.userId)) ||
    subscription.purchasedById === user.id ||
    user.role === "ADMIN";

  if (!allowed) return { error: "Keine Berechtigung." };

  if (subscription.status === "CANCELLED") {
    return { error: "Diese Mitgliedschaft ist bereits beendet." };
  }

  if (subscription.status !== "PENDING") {
    return { error: "Nur ausstehende Mitgliedschaften können beendet werden." };
  }

  const creditRecipientId = subscription.purchasedById ?? user.id;
  let creditedCents = 0;

  if (
    subscription.paymentMethod === "BANK_TRANSFER" &&
    subscription.creditAppliedCents > 0
  ) {
    const reservedCredit = await prisma.creditTransaction.findFirst({
      where: { subscriptionId: subscription.id, kind: "PAYMENT" },
    });
    if (reservedCredit) {
      creditedCents = subscription.creditAppliedCents;
      await addCreditBalance(creditRecipientId, creditedCents, {
        description: `Stornierung: ${subscription.plan.title}`,
        subscriptionId: subscription.id,
      });
    }
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: cancelledSubscriptionData,
  });

  revalidatePath("/konto");
  revalidatePath(`/abos/${subscription.plan.id}`);
  revalidatePath("/abos");
  revalidatePath("/admin/buchhaltung");
  revalidatePath("/admin");
  revalidatePath("/admin/abos");

  return { ok: true, creditedCents };
}
