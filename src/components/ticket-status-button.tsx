"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateSupportTicketStatusAction,
  type UpdateSupportTicketStatusState,
} from "@/app/actions/support-ticket";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function TicketStatusButton({
  ticketId,
  status,
}: {
  ticketId: string;
  status: "OPEN" | "CLOSED";
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    UpdateSupportTicketStatusState,
    FormData
  >(updateSupportTicketStatusAction, null);

  useEffect(() => {
    if (state && "ok" in state) router.refresh();
  }, [state, router]);

  const nextStatus = status === "OPEN" ? "CLOSED" : "OPEN";

  return (
    <form action={formAction}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button
        type="submit"
        size="sm"
        variant={status === "OPEN" ? "outline" : "secondary"}
        disabled={pending}
        className="h-7 w-full px-2 text-xs"
      >
        {pending
          ? t("common.saving")
          : status === "OPEN"
            ? t("admin.ticketMarkClosed")
            : t("admin.ticketMarkOpen")}
      </Button>
    </form>
  );
}
