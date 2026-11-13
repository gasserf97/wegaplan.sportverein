"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  requestPasswordResetAction,
  type PasswordResetRequestState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/locale-provider";
import { PASSWORD_RESET_HOURS } from "@/lib/password-reset-config";

export function ForgotPasswordForm({ nextPath }: { nextPath: string }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    PasswordResetRequestState,
    FormData
  >(requestPasswordResetAction, null);

  if (state && "sent" in state) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {t("auth.resetEmailSent", {
            email: state.email,
            hours: PASSWORD_RESET_HOURS,
          })}
        </p>
        <Link
          href={`/anmelden?next=${encodeURIComponent(nextPath)}`}
          className="text-center text-sm underline"
        >
          {t("auth.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
      <div className="grid gap-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      {state && "error" in state ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("common.pleaseWait") : t("auth.sendResetEmail")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href={`/anmelden?next=${encodeURIComponent(nextPath)}`}
          className="underline"
        >
          {t("auth.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
