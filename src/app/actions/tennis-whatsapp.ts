"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  TENNIS_WHATSAPP_MEMBER_COOKIE,
  type TennisWhatsAppSource,
} from "@/lib/tennis-whatsapp";

export async function recordTennisWhatsAppResponseAction(
  choice: "ALREADY_MEMBER" | "NO_INTEREST",
  source: TennisWhatsAppSource,
) {
  if (choice !== "ALREADY_MEMBER" && choice !== "NO_INTEREST") {
    return { error: "Ungültige Auswahl." };
  }
  if (source !== "payment_success" && source !== "tennis_page") {
    return { error: "Ungültige Quelle." };
  }

  const user = await getCurrentUser();
  await prisma.tennisWhatsAppResponse.create({
    data: {
      choice,
      source,
      userId: user?.id ?? null,
    },
  });
  if (choice === "ALREADY_MEMBER") {
    const store = await cookies();
    store.set(TENNIS_WHATSAPP_MEMBER_COOKIE, "1", {
      maxAge: 60 * 60 * 24 * 365 * 10,
      path: "/",
      sameSite: "lax",
    });
    revalidatePath("/tennisplatz");
    revalidatePath("/zahlung/erfolg");
  }
  return { ok: true as const };
}
