import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { TENNIS_WHATSAPP_MEMBER_COOKIE } from "@/lib/tennis-whatsapp";

/** Hinweis ausblenden, wenn diese Person oder dieser Browser schon Mitglied ist. */
export async function tennisWhatsAppInviteDismissed(userId: string | null) {
  const store = await cookies();
  if (store.get(TENNIS_WHATSAPP_MEMBER_COOKIE)?.value === "1") return true;
  if (!userId) return false;
  const existing = await prisma.tennisWhatsAppResponse.findFirst({
    where: { userId, choice: "ALREADY_MEMBER" },
    select: { id: true },
  });
  return Boolean(existing);
}
