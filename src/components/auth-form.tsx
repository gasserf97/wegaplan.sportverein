"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  loginAction,
  registerAction,
  type AuthState,
  type RegisterDraftFields,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/locale-provider";
import { rememberClientChannel } from "@/lib/client-channel";
import { markPwaInstallPromptPending } from "@/lib/pwa-install";

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "register";
  nextPath: string;
}) {
  const { t } = useI18n();
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (state && "success" in state) {
      // Fallback if a success payload is returned instead of a server redirect.
      window.location.assign(state.next);
    }
  }, [state]);

  const registerDraft: RegisterDraftFields | undefined =
    mode === "register" && state && "error" in state ? state.fields : undefined;
  const [acceptPrivacy, setAcceptPrivacy] = useState(
    () => registerDraft?.acceptPrivacy ?? false,
  );
  const pendingEmail =
    state && "pendingVerification" in state ? state.email : null;
  const wasResent =
    state && "pendingVerification" in state ? Boolean(state.resent) : false;
  const formKey = registerDraft
    ? `register-${registerDraft.email}-${registerDraft.acceptPrivacy}`
    : pendingEmail
      ? `pending-${pendingEmail}-${wasResent ? "resent" : "new"}`
      : "auth";

  if (pendingEmail) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {wasResent
            ? t("auth.checkEmailResent", { email: pendingEmail })
            : t("auth.checkEmail", { email: pendingEmail })}
        </p>
        <p className="text-sm text-muted-foreground">{t("auth.resendHint")}</p>
        <form action={formAction}>
          <input type="hidden" name="next" value={nextPath} />
          <input type="hidden" name="email" value={pendingEmail} />
          <input type="hidden" name="acceptPrivacy" value="on" />
          <Button type="submit" variant="outline" disabled={pending} className="w-full">
            {pending ? t("common.pleaseWait") : t("auth.resendConfirmEmail")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.hasAccountPrefix")}{" "}
          <Link
            href={`/anmelden?next=${encodeURIComponent(nextPath)}`}
            className="underline"
          >
            {t("nav.login")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={() => {
        // Server login redirects; mark before navigation so the install dialog can open.
        rememberClientChannel();
        if (mode === "login") markPwaInstallPromptPending();
      }}
    >
      <input type="hidden" name="next" value={nextPath} />
      {mode === "register" ? (
        <p className="text-sm text-muted-foreground">{t("auth.registerHint")}</p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={registerDraft?.email}
          required
        />
      </div>
      {mode === "login" ? (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Link
              href={`/passwort-vergessen?next=${encodeURIComponent(nextPath)}`}
              className="text-sm text-muted-foreground underline"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      ) : (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acceptPrivacy"
            checked={acceptPrivacy}
            onChange={(event) => setAcceptPrivacy(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
            required
          />
          <span>
            {t("auth.acceptPrivacyPrefix")}{" "}
            <Link href="/datenschutz" className="underline" target="_blank">
              {t("nav.privacy")}
            </Link>{" "}
            {t("auth.acceptPrivacySuffix")}
          </span>
        </label>
      )}
      {state && "error" in state ? (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{state.error}</p>
        </div>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending || (mode === "register" && !acceptPrivacy)}
        className="w-full"
      >
        {pending
          ? t("common.pleaseWait")
          : mode === "login"
            ? t("nav.login")
            : t("auth.sendConfirmEmail")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            {t("auth.noAccountPrefix")}{" "}
            <Link
              href={`/registrieren?next=${encodeURIComponent(nextPath)}`}
              className="underline"
            >
              {t("nav.register")}
            </Link>
          </>
        ) : (
          <>
            {t("auth.hasAccountPrefix")}{" "}
            <Link
              href={`/anmelden?next=${encodeURIComponent(nextPath)}`}
              className="underline"
            >
              {t("nav.login")}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
