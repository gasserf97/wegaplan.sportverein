"use client";

import { useTransition } from "react";
import { stopImpersonationAction } from "@/app/actions/impersonation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function ImpersonationBanner({
  targetName,
}: {
  targetName: string;
}) {
  const { t } = useI18n();
  const [pending, start] = useTransition();

  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm leading-6">
          <strong className="font-semibold">{t("impersonation.bannerTitle")}</strong>{" "}
          {t("impersonation.bannerText", { name: targetName })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-amber-600/40 bg-white/70 hover:bg-white dark:bg-background/60"
          disabled={pending}
          onClick={() => {
            start(async () => {
              await stopImpersonationAction();
            });
          }}
        >
          {pending
            ? t("impersonation.stopping")
            : t("impersonation.stop")}
        </Button>
      </div>
    </div>
  );
}
