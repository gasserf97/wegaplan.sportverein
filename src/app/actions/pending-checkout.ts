"use server";

import { revalidatePath } from "next/cache";
import {
  abandonPendingCourseCheckout,
  abandonPendingSubscriptionCheckout,
} from "@/lib/abandon-checkout";
import {
  expireStalePendingEnrollments,
  expireStalePendingSubscriptions,
} from "@/lib/expire-pending";

function revalidateCommercePaths() {
  revalidatePath("/kurse");
  revalidatePath("/konto");
  revalidatePath("/abos");
  revalidatePath("/autos");
  revalidatePath("/autos/meine");
  revalidatePath("/tennisplatz");
  revalidatePath("/tennisplatz/meine");
  revalidatePath("/admin");
  revalidatePath("/admin/abos");
  revalidatePath("/admin/tennisplaetze");
  revalidatePath("/admin/geraete");
  revalidatePath("/admin/buchhaltung");
}

export async function abandonPendingCourseCheckoutAction(courseId: string) {
  const result = await abandonPendingCourseCheckout(courseId);
  revalidateCommercePaths();
  return result;
}

export async function abandonPendingSubscriptionCheckoutAction(planId: string) {
  const result = await abandonPendingSubscriptionCheckout(planId);
  revalidateCommercePaths();
  return result;
}

export { expireStalePendingEnrollments, expireStalePendingSubscriptions };
