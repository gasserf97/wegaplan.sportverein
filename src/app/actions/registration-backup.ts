"use server";

import { getCurrentUser } from "@/lib/auth";
import { canAccessStaffAdmin } from "@/lib/permissions";
import { sendRegistrationBackupEmail } from "@/lib/registration-backup";

export type SendRegistrationBackupState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function sendRegistrationBackupAction(
  _prev: SendRegistrationBackupState,
  _formData: FormData,
): Promise<SendRegistrationBackupState> {
  const user = await getCurrentUser();
  if (!user || !(await canAccessStaffAdmin(user))) {
    return { ok: false, error: "Nicht berechtigt." };
  }

  const result = await sendRegistrationBackupEmail();
  if (!result.ok) {
    return { ok: false, error: result.message };
  }
  return {
    ok: true,
    message: `Backup gesendet an ${result.to.join(", ")} (${result.filename}, ${result.membersFilename}).`,
  };
}
