"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  confirmPendingRefundAction,
  type ConfirmPendingRefundState,
} from "@/app/actions/pending-refund";
import { Button } from "@/components/ui/button";

export function ConfirmPendingRefundButton({
  id,
  label = "Zurücküberwiesen",
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ConfirmPendingRefundState,
    FormData
  >(confirmPendingRefundAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="default" disabled={pending}>
        {pending ? "Speichern…" : label}
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
