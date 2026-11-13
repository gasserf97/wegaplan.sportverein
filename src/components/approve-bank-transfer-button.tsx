"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  approveBankTransferAction,
  type ApproveBankTransferState,
} from "@/app/actions/bank-transfer";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function ApproveBankTransferButton({
  kind,
  id,
  label,
}: {
  kind: "course" | "subscription";
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    ApproveBankTransferState,
    FormData
  >(approveBankTransferAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="default" disabled={pending}>
        {pending ? t("common.saving") : (label ?? t("payment.approvePayment"))}
      </Button>
      {state?.ok ? (
        <p className="text-xs text-emerald-700">{state.message}</p>
      ) : null}
      {state && !state.ok ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
