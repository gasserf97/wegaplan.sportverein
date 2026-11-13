"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissCalendarSyncTennisPromptAction } from "@/app/actions/calendar-sync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/locale-provider";

export const CALENDAR_SYNC_HASH = "kalender";
export const calendarSyncKontoHref = `/konto#${CALENDAR_SYNC_HASH}`;

type OfferKind = "tennis" | "courses";

export function CalendarSyncOffer({
  open,
  kind,
  onClose,
}: {
  open: boolean;
  kind: OfferKind;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [visible, setVisible] = useState(open);
  const [pending, start] = useTransition();

  useEffect(() => {
    setVisible(open);
  }, [open]);

  function close() {
    setVisible(false);
    onClose?.();
  }

  function accept() {
    close();
    router.push(calendarSyncKontoHref);
  }

  function decline() {
    if (kind !== "tennis") {
      close();
      return;
    }
    start(async () => {
      await dismissCalendarSyncTennisPromptAction();
      close();
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
          <DialogTitle>
            {kind === "tennis"
              ? t("account.calendarOfferTennisTitle")
              : t("account.calendarOfferCourseTitle")}
          </DialogTitle>
          <DialogDescription>
            {kind === "tennis"
              ? t("account.calendarOfferTennisBody")
              : t("account.calendarOfferCourseBody")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={decline}
          >
            {t("account.calendarOfferNo")}
          </Button>
          <Button type="button" disabled={pending} onClick={accept}>
            {t("account.calendarOfferYes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
