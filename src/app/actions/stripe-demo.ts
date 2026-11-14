"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  fulfillShowcaseSession,
  isShowcaseTestCard,
  loadShowcaseCheckout,
  showcaseCheckoutPath,
} from "@/lib/stripe-demo";
import { isStripeDemoMode } from "@/lib/stripe";

export async function confirmShowcasePaymentAction(formData: FormData) {
  if (!isStripeDemoMode()) {
    redirect("/");
  }

  const sessionId = String(formData.get("sessionId") ?? "");
  const card = String(formData.get("card") ?? "");
  const checkout = await loadShowcaseCheckout(sessionId);
  if (!checkout) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (checkout.payerUserId) {
    if (!user || (user.id !== checkout.payerUserId && user.role !== "ADMIN")) {
      redirect(`/anmelden?next=${encodeURIComponent(showcaseCheckoutPath(sessionId))}`);
    }
  }

  if (!isShowcaseTestCard(card)) {
    redirect(`${showcaseCheckoutPath(sessionId)}&error=card`);
  }

  await fulfillShowcaseSession(sessionId);
  redirect(`/zahlung/erfolg?session_id=${encodeURIComponent(sessionId)}`);
}
