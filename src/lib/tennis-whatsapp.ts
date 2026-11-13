export const TENNIS_WHATSAPP_INVITE_URL =
  "https://chat.whatsapp.com/DEEkZNpr6wXILtATxw15rP?s=cl&p=i&mlu=4&ilr=4&iam=2";

/** Gesetzt, wenn „Ich bin schon Mitglied“ gewählt wurde. */
export const TENNIS_WHATSAPP_MEMBER_COOKIE = "tennis-whatsapp-member";

export type TennisWhatsAppSource = "payment_success" | "tennis_page";

export function isTennisSeasonAddonPlan(plan: {
  kind: string;
  section?: { name: string } | null;
}) {
  return plan.kind === "ADDON" && plan.section?.name === "Tennis";
}
