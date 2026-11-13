"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CircleHelpIcon } from "lucide-react";
import {
  createSupportTicketAction,
  type SupportTicketState,
} from "@/app/actions/support-ticket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

export function SupportTicketButton({
  isLoggedIn,
}: {
  isLoggedIn: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    SupportTicketState,
    FormData
  >(createSupportTicketAction, null);

  useEffect(() => {
    if (state && "success" in state) {
      const timer = setTimeout(() => setOpen(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const formKey = state && "success" in state ? "sent" : "new";
  const draft = state && "error" in state ? state.fields : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-50 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90",
          "right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6",
        )}
        aria-label={t("support.open")}
      >
        <CircleHelpIcon className="size-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(90dvh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 gap-2 p-4 pb-0">
            <DialogTitle>{t("support.title")}</DialogTitle>
            <DialogDescription>{t("support.description")}</DialogDescription>
          </DialogHeader>

          {isLoggedIn ? (
            <form
              key={draft ? `draft-${draft.subject}` : formKey}
              action={formAction}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
                <div className="grid gap-2">
                  <Label htmlFor="support-subject">{t("support.subject")}</Label>
                  <Input
                    id="support-subject"
                    name="subject"
                    maxLength={120}
                    defaultValue={draft?.subject}
                    required
                    disabled={pending}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="support-message">{t("support.message")}</Label>
                  <Textarea
                    id="support-message"
                    name="message"
                    rows={5}
                    maxLength={5000}
                    defaultValue={draft?.message}
                    required
                    disabled={pending}
                    className="max-h-48 min-h-28 resize-y overflow-y-auto [field-sizing:fixed]"
                  />
                </div>
                {state && "error" in state ? (
                  <p className="text-sm text-destructive">{state.error}</p>
                ) : null}
                {state && "success" in state ? (
                  <p className="text-sm text-emerald-700">{t("support.sent")}</p>
                ) : null}
              </div>
              <div className="shrink-0 border-t border-border bg-popover p-4">
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? t("common.pleaseWait") : t("support.submit")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-3 p-4 text-sm">
              <p className="text-muted-foreground">{t("support.loginRequired")}</p>
              <Button render={<Link href="/anmelden" />} nativeButton={false}>
                {t("nav.login")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
