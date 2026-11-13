"use server";

import { revalidatePath } from "next/cache";
import { requireCourseManager } from "@/lib/auth";
import { confirmPendingRefundTransfer } from "@/lib/pending-refund";
import { getManagedSectionIds, getUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type ConfirmPendingRefundState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function confirmPendingRefundAction(
  _prev: ConfirmPendingRefundState,
  formData: FormData,
): Promise<ConfirmPendingRefundState> {
  const manager = await requireCourseManager();
  if (!manager) {
    return { ok: false, error: "Keine Berechtigung." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Eintrag nicht gefunden." };

  const transfer = await prisma.pendingRefundTransfer.findUnique({
    where: { id },
  });
  if (!transfer || transfer.status !== "PENDING") {
    return { ok: false, error: "Keine offene Rücküberweisung." };
  }

  const access = await getUserAccess(manager.id);
  if (!access.isGlobalAdmin) {
    const sectionIds = await getManagedSectionIds(manager.id);
    if (!transfer.sectionId || !sectionIds.includes(transfer.sectionId)) {
      return { ok: false, error: "Keine Berechtigung für diese Sektion." };
    }
  }

  const result = await confirmPendingRefundTransfer(id, manager.id);
  if ("error" in result) {
    return { ok: false, error: result.error ?? "Unbekannter Fehler." };
  }

  revalidatePath("/admin/buchhaltung");
  revalidatePath("/konto");
  revalidatePath("/admin");

  return {
    ok: true,
    message: "Rücküberweisung bestätigt – Einnahmen und Guthaben wurden angepasst.",
  };
}
