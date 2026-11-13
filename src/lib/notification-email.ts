import { isSendableEmail } from "@/lib/mail";
import { isFamilyEmailPlaceholder } from "@/lib/profile";

/** Prefer the member mailbox; otherwise any fallback (purchaser / family account). */
export function resolveNotificationEmail(
  memberEmail: string | null | undefined,
  ...fallbacks: Array<string | null | undefined>
): string | null {
  if (isSendableEmail(memberEmail) && !isFamilyEmailPlaceholder(memberEmail)) {
    return memberEmail!.trim();
  }
  for (const email of fallbacks) {
    if (isSendableEmail(email) && !isFamilyEmailPlaceholder(email)) {
      return email!.trim();
    }
  }
  return null;
}

export type ConfirmationDelivery = {
  email: string;
  /** Anrede in der Mail (Empfänger, nicht zwingend die gebuchte Person). */
  greetingName: string;
  /** True = Mitglied hat eigene Mail; keine Kopie an den Käufer. */
  isOwnMailbox: boolean;
};

/**
 * Genau ein Empfänger: eigene Mail des Mitglieds, sonst Käufer, sonst Familienkonto.
 * Kein CC an den Käufer, wenn das Mitglied eine eigene Adresse hat.
 */
export function resolveConfirmationDelivery(input: {
  memberEmail: string | null | undefined;
  memberName: string;
  purchaserEmail?: string | null;
  purchaserName?: string | null;
  managerEmail?: string | null;
  managerName?: string | null;
}): ConfirmationDelivery | null {
  if (
    isSendableEmail(input.memberEmail) &&
    !isFamilyEmailPlaceholder(input.memberEmail)
  ) {
    return {
      email: input.memberEmail!.trim(),
      greetingName: input.memberName,
      isOwnMailbox: true,
    };
  }
  if (
    isSendableEmail(input.purchaserEmail) &&
    !isFamilyEmailPlaceholder(input.purchaserEmail)
  ) {
    return {
      email: input.purchaserEmail!.trim(),
      greetingName: input.purchaserName?.trim() || input.memberName,
      isOwnMailbox: false,
    };
  }
  if (
    isSendableEmail(input.managerEmail) &&
    !isFamilyEmailPlaceholder(input.managerEmail)
  ) {
    return {
      email: input.managerEmail!.trim(),
      greetingName: input.managerName?.trim() || input.memberName,
      isOwnMailbox: false,
    };
  }
  return null;
}
