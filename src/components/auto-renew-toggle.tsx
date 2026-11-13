"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setSubscriptionAutoRenewAction } from "@/app/actions/subscriptions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function AutoRenewToggle({
  subscriptionId,
  autoRenew,
  offered,
}: {
  subscriptionId: string;
  autoRenew: boolean;
  offered: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(autoRenew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(autoRenew);
  }, [autoRenew]);

  if (!offered && !enabled) return null;

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant={enabled ? "default" : "destructive"}
        size="sm"
        className={
          enabled
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : undefined
        }
        disabled={pending || (!offered && !enabled)}
        onClick={() => {
          const next = !enabled;
          setError(null);
          setEnabled(next);
          start(async () => {
            const result = await setSubscriptionAutoRenewAction(
              subscriptionId,
              next,
            );
            if (result?.error) {
              setEnabled(!next);
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending
          ? t("common.saving")
          : enabled
            ? t("subscriptions.turnOffRenewal")
            : t("subscriptions.turnOnRenewal")}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
