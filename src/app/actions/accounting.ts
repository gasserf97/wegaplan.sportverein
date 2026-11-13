"use server";

import { revalidatePath } from "next/cache";
import { isSuccessfulAccountingPayment } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export async function deleteAccountingPaymentAction(
  paymentKey: string,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const { t } = await getServerI18n();
  if (!admin) return { error: t("accounting.deleteForbidden") };

  if (!(await isSuccessfulAccountingPayment(paymentKey))) {
    return { error: t("accounting.deleteFailed") };
  }

  await prisma.accountingExclusion.upsert({
    where: { paymentKey },
    create: { paymentKey, excludedById: admin.id },
    update: {},
  });

  revalidatePath("/admin/buchhaltung");
  return {};
}
