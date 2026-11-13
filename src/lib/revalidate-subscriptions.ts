import { revalidatePath } from "next/cache";

/** Refresh Abo catalog and admin subscription views after purchases/cancels. */
export function revalidateSubscriptionViews(
  planId?: string | string[] | null,
) {
  revalidatePath("/admin");
  revalidatePath("/admin/abos");
  revalidatePath("/abos");
  revalidatePath("/konto");
  revalidatePath("/admin/buchhaltung");

  const ids = Array.isArray(planId)
    ? planId
    : planId
      ? [planId]
      : [];
  for (const id of ids) {
    if (!id) continue;
    revalidatePath(`/abos/${id}`);
    revalidatePath(`/admin/abos/${id}`);
    revalidatePath(`/admin/abos/${id}/anmeldungen`);
  }
}
