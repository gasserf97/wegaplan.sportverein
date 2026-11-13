"use client";

import { useActionState } from "react";
import {
  sendRegistrationBackupAction,
  type SendRegistrationBackupState,
} from "@/app/actions/registration-backup";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function SendRegistrationBackupButton() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    SendRegistrationBackupState,
    FormData
  >(sendRegistrationBackupAction, null);

  return (
    <form action={formAction} className="grid gap-1">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending
          ? t("admin.registrationBackupPending")
          : t("admin.registrationBackupSend")}
      </Button>
      {state && "ok" in state && state.ok ? (
        <p className="text-xs text-emerald-700">{state.message}</p>
      ) : null}
      {state && "error" in state ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
