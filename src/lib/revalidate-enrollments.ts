import { revalidatePath } from "next/cache";

/** Refresh public course pages and admin “Letzte Anmeldungen”. */
export function revalidateEnrollmentViews(
  courseId?: string | string[] | null,
) {
  revalidatePath("/admin");
  revalidatePath("/kurse");
  revalidatePath("/konto");
  revalidatePath("/admin/buchhaltung");

  const ids = Array.isArray(courseId)
    ? courseId
    : courseId
      ? [courseId]
      : [];
  for (const id of ids) {
    if (!id) continue;
    revalidatePath(`/kurse/${id}`);
    revalidatePath(`/admin/kurse/${id}`);
    revalidatePath(`/admin/kurse/${id}/anmeldungen`);
  }
}
