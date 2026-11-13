"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageCircleIcon } from "lucide-react";
import { recordTennisWhatsAppResponseAction } from "@/app/actions/tennis-whatsapp";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TENNIS_WHATSAPP_INVITE_URL,
  type TennisWhatsAppSource,
} from "@/lib/tennis-whatsapp";

export function TennisWhatsAppInviteDialog({
  open,
  source,
  onClose,
  onAlreadyMember,
}: {
  open: boolean;
  source: TennisWhatsAppSource;
  onClose?: () => void;
  onAlreadyMember?: () => void;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(open);
  const [pending, start] = useTransition();

  useEffect(() => {
    setVisible(open);
  }, [open]);

  function close() {
    setVisible(false);
    onClose?.();
  }

  function respond(choice: "ALREADY_MEMBER" | "NO_INTEREST") {
    start(async () => {
      const result = await recordTennisWhatsAppResponseAction(choice, source);
      if ("error" in result) return;
      close();
      if (choice === "ALREADY_MEMBER") onAlreadyMember?.();
    });
  }

  return (
    <Dialog
      open={visible}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t("tennis.whatsappTitle")}</DialogTitle>
          <DialogDescription className="text-left leading-6">
            {t("tennis.whatsappBody")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button
            nativeButton={false}
            render={
              <a
                href={TENNIS_WHATSAPP_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
              />
            }
          >
            {t("tennis.whatsappJoin")}
          </Button>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => respond("ALREADY_MEMBER")}
          >
            {t("tennis.whatsappAlreadyMember")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => respond("NO_INTEREST")}
          >
            {t("tennis.whatsappNoInterest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kleiner Hinweis auf der Tennisplatz-Seite – öffnet dasselbe Popup. */
export function TennisWhatsAppBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-border border-l-4 border-l-accent bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent/10"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <MessageCircleIcon className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-medium text-foreground">
          {t("tennis.whatsappBanner")}
        </span>
      </button>
      <TennisWhatsAppInviteDialog
        open={open}
        source="tennis_page"
        onClose={() => setOpen(false)}
        onAlreadyMember={() => setHidden(true)}
      />
    </>
  );
}
