"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAccountingPaymentAction } from "@/app/actions/accounting";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";

export function DeleteAccountingPaymentButton({
  paymentKey,
  title,
  person,
  amount,
}: {
  paymentKey: string;
  title: string;
  person: string;
  amount: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              t("accounting.deleteConfirm", { title, person, amount }),
            )
          ) {
            return;
          }
          setError(null);
          start(async () => {
            const result = await deleteAccountingPaymentAction(paymentKey);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? t("common.pleaseWait") : t("accounting.deletePayment")}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
