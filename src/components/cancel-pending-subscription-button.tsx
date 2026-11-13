"use client";

import { useState, useTransition } from "react";
import { cancelPendingSubscriptionAction } from "@/app/actions/subscription-cancel";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";
import { formatEuro } from "@/lib/format";

export function CancelPendingSubscriptionButton({
  subscriptionId,
  planTitle,
  refundCents = 0,
}: {
  subscriptionId: string;
  planTitle: string;
  refundCents?: number;
}) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  const refundHint =
    refundCents > 0
      ? ` ${formatEuro(refundCents)} werden Ihrem Guthaben gutgeschrieben.`
      : "";

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const ok = window.confirm(
            `${t("subscriptions.cancelConfirm", { title: planTitle })}${refundHint}`,
          );
          if (!ok) return;
          setError(null);
          start(async () => {
            const result = await cancelPendingSubscriptionAction(subscriptionId);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setDone(true);
            window.location.reload();
          });
        }}
      >
        {pending ? t("subscriptions.cancelling") : t("subscriptions.cancelAbo")}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
