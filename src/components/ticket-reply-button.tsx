"use client";

import { useActionState, useEffect, useState } from "react";
import {
  replySupportTicketAction,
  type ReplySupportTicketState,
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

export function TicketReplyButton({
  ticketId,
  recipientName,
  recipientEmail,
  subject,
}: {
  ticketId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    ReplySupportTicketState,
    FormData
  >(replySupportTicketAction, null);

  useEffect(() => {
    if (state && "ok" in state) {
      const timer = setTimeout(() => setOpen(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const formKey = state && "ok" in state ? "sent" : open ? "open" : "idle";

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-full px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        {t("admin.ticketReply")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(90dvh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 gap-2 p-4 pb-0">
            <DialogTitle>
              {t("admin.ticketReplyTitle", { name: recipientName })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.ticketReplyTo", { email: recipientEmail })}
              <span className="mt-1 block truncate text-foreground/80">
                {subject}
              </span>
            </DialogDescription>
          </DialogHeader>

          {state && "ok" in state ? (
            <p className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
              {t("admin.ticketReplySent")}
            </p>
          ) : (
            <form
              key={formKey}
              action={formAction}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
            >
              <input type="hidden" name="ticketId" value={ticketId} />
              <div className="grid gap-2">
                <Label htmlFor={`ticket-reply-${ticketId}`}>
                  {t("admin.ticketReplyBody")}
                </Label>
                <Textarea
                  id={`ticket-reply-${ticketId}`}
                  name="body"
                  required
                  minLength={5}
                  maxLength={5000}
                  rows={8}
                  className="min-h-40 resize-y"
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
                  {pending
                    ? t("common.saving")
                    : t("admin.ticketReplySend")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
