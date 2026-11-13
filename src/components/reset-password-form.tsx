"use client";

import { useActionState, useEffect } from "react";
import {
  resetPasswordAction,
  type ConfirmEmailState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/locale-provider";
import { rememberClientChannel } from "@/lib/client-channel";
import { markPwaInstallPromptPending } from "@/lib/pwa-install";

export function ResetPasswordForm({
  token,
  nextPath,
  email,
}: {
  token: string;
  nextPath: string;
  email: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    ConfirmEmailState,
    FormData
  >(resetPasswordAction, null);

  useEffect(() => {
    if (state && "success" in state) {
      window.location.assign(state.next);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={() => {
        rememberClientChannel();
        markPwaInstallPromptPending();
      }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={nextPath} />
      <p className="text-sm text-muted-foreground">
        {t("auth.resetPasswordDesc", { email })}
      </p>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="passwordConfirm">{t("auth.passwordConfirm")}</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state && "error" in state ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("common.pleaseWait") : t("auth.saveNewPassword")}
      </Button>
    </form>
  );
}
