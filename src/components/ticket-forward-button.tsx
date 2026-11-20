"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forwardSupportTicketAction,
  type ForwardSupportTicketState,
} from "@/app/actions/support-ticket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/locale-provider";

export function TicketForwardButton({
  ticketId,
  forwarded,
  forwardNote,
}: {
  ticketId: string;
  forwarded: boolean;
  forwardNote: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    ForwardSupportTicketState,
    FormData
  >(forwardSupportTicketAction, null);

  useEffect(() => {
    if (state && "ok" in state) {
      router.refresh();
      const timer = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  const formKey = state && "ok" in state ? "sent" : open ? "open" : "idle";

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto min-h-7 w-full whitespace-normal px-2 py-1 text-xs leading-tight"
        onClick={() => setOpen(true)}
      >
        {forwarded ? t("admin.ticketForwardAgain") : t("admin.ticketForward")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(90dvh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 gap-2 p-4 pb-0">
            <DialogTitle>{t("admin.ticketForwardTitle")}</DialogTitle>
            <DialogDescription>
              {forwarded
                ? t("admin.ticketForwardAgainHint")
                : t("admin.ticketForwardHint")}
            </DialogDescription>
          </DialogHeader>

          {state && "ok" in state ? (
            <p className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
              {t("admin.ticketForwardSent")}
            </p>
          ) : (
            <form
              key={formKey}
              action={formAction}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
            >
              <input type="hidden" name="ticketId" value={ticketId} />
              <div className="grid gap-2">
                <Label htmlFor={`ticket-forward-${ticketId}`}>
                  {t("admin.ticketForwardNote")}
                </Label>
                <Textarea
                  id={`ticket-forward-${ticketId}`}
                  name="note"
                  maxLength={2000}
                  rows={5}
                  defaultValue={forwardNote}
                  className="min-h-28 resize-y"
                />
              </div>
              {state && "error" in state ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? t("common.saving") : t("admin.ticketForwardSend")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
