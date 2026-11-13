"use server";

import { revalidatePath } from "next/cache";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { householdRootId } from "@/lib/family";
import { ageFromBirthDate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { listAllStripeSecretKeys } from "@/lib/section-payments";
import {
  isStripeSubscriptionGone,
  syncStripeRecurringToLocalAutoRenew,
} from "@/lib/stripe-subscription-cancel";

export type DeleteOwnAccountState =
  | { error: string }
  | { ok: true; next: string }
  | null;

async function cancelStripeRecurringForUser(userId: string) {
  if ((await listAllStripeSecretKeys()).length === 0) return;

  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      OR: [
        { stripeSubscriptionId: { not: null } },
        { stripeSessionId: { not: null } },
      ],
    },
    select: {
      id: true,
      periodEnd: true,
      stripeSubscriptionId: true,
      stripeSessionId: true,
    },
  });

  for (const subscription of subscriptions) {
    try {
      await syncStripeRecurringToLocalAutoRenew({
        ...subscription,
        autoRenew: false,
      });
    } catch (error) {
      if (!isStripeSubscriptionGone(error)) throw error;
    }
  }
}

/**
 * Nutzer löscht das eigene Konto.
 * Root mit Minderjährigen: includeMinors=true löscht auch unter 18;
 * includeMinors=false nur, wenn ein anderes volljähriges Familienmitglied bleibt.
 */
export async function deleteOwnAccountAction(
  includeMinors: boolean,
): Promise<DeleteOwnAccountState> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Bitte anmelden." };

  const rootId = await householdRootId(actor.id);
  if (!rootId) return { error: "Konto nicht gefunden." };

  const members = await prisma.user.findMany({
    where: {
      OR: [{ id: rootId }, { managedById: rootId }],
    },
    select: {
      id: true,
      role: true,
      birthDate: true,
      managedById: true,
    },
  });

  const self = members.find((member) => member.id === actor.id);
  if (!self) return { error: "Konto nicht gefunden." };

  const isRoot = self.id === rootId;
  const minors = members.filter(
    (member) =>
      member.id !== self.id && ageFromBirthDate(member.birthDate) < 18,
  );
  const otherAdults = members.filter(
    (member) =>
      member.id !== self.id && ageFromBirthDate(member.birthDate) >= 18,
  );

  if (minors.length > 0 && !includeMinors && isRoot && otherAdults.length === 0) {
    return {
      error:
        "Ohne weiteres volljähriges Familienmitglied können die Kinder nicht behalten werden. Bitte auch die Daten der Kinder löschen.",
    };
  }

  if (minors.length > 0 && !includeMinors && !isRoot) {
    // Nicht-Root: Kinder bleiben beim Haushaltskonto – nur sich selbst löschen.
  }

  if (self.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { error: "Der letzte Haupt-Admin kann nicht gelöscht werden." };
    }
  }

  const idsToDelete = new Set<string>([self.id]);
  if (includeMinors && isRoot) {
    for (const minor of minors) idsToDelete.add(minor.id);
  }

  const pendingRefundCount = await prisma.pendingRefundTransfer.count({
    where: { userId: { in: [...idsToDelete] }, status: "PENDING" },
  });
  if (pendingRefundCount > 0) {
    return {
      error:
        "Es gibt noch offene Rücküberweisungen. Bitte zuerst den Verein kontaktieren oder in der Buchhaltung abschließen.",
    };
  }

  // Vor dem Löschen des Roots: verbleibende Personen auf neues Root umhängen,
  // sonst löscht onDelete:Cascade den ganzen Haushalt.
  if (isRoot) {
    const remainingAdults = otherAdults;
    if (remainingAdults.length > 0) {
      const newRootId = remainingAdults[0].id;
      await prisma.user.update({
        where: { id: newRootId },
        data: { managedById: null },
      });
      const keepIds = remainingAdults
        .map((member) => member.id)
        .filter((id) => id !== newRootId);
      if (!includeMinors) {
        keepIds.push(...minors.map((member) => member.id));
      }
      if (keepIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: keepIds } },
          data: { managedById: newRootId },
        });
      }
    }
  }

  for (const userId of idsToDelete) {
    try {
      await cancelStripeRecurringForUser(userId);
    } catch (error) {
      console.error("Stripe beim eigenen Konto löschen", userId, error);
      return {
        error:
          "Laufende Kartenzahlungen konnten bei Stripe nicht beendet werden. Bitte später erneut versuchen.",
      };
    }
  }

  // Minderjährige zuerst, dann das eigene Konto (Root zuletzt).
  const deleteOrder = [...idsToDelete].sort((a, b) => {
    if (a === self.id) return 1;
    if (b === self.id) return -1;
    return 0;
  });

  for (const userId of deleteOrder) {
    await prisma.user.delete({ where: { id: userId } });
  }

  await clearSessionCookie();
  revalidatePath("/", "layout");
  revalidatePath("/konto");
  revalidatePath("/konto/familie");
  return { ok: true, next: "/" };
}
