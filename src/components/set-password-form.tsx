"use client";

import { useActionState, useEffect } from "react";
import {
  setPasswordAfterVerifyAction,
  type ConfirmEmailState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rememberClientChannel } from "@/lib/client-channel";
import { markPwaInstallPromptPending } from "@/lib/pwa-install";

export function SetPasswordForm({
  token,
  nextPath,
  email,
}: {
  token: string;
  nextPath: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<
    ConfirmEmailState,
    FormData
  >(setPasswordAfterVerifyAction, null);

  useEffect(() => {
    if (state && "success" in state) {
      // Full navigation so the Stammdaten gate runs with the new session cookie.
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
        Konto: <span className="font-medium text-foreground">{email}</span>
      </p>
      <div className="grid gap-2">
        <Label htmlFor="password">Passwort</Label>
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
        <Label htmlFor="passwordConfirm">Passwort wiederholen</Label>
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
        {pending ? "Bitte warten…" : "Passwort speichern und weiter"}
      </Button>
    </form>
  );
}
