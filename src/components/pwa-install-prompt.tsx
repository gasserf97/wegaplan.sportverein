"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClubLogo } from "@/components/club-logo";
import { useI18n } from "@/components/locale-provider";
import {
  bindPwaInstallListeners,
  canOfferPwaInstall,
  clearDeferredPwaPrompt,
  getDeferredPwaPrompt,
  isIosDevice,
  consumeSessionPwaInstallOffer,
  markSessionPwaInstallOffered,
  needsSafariRedirectForInstall,
  onPwaInstallPromptRequest,
  openCurrentPageInSafari,
  registerPwaServiceWorker,
  releaseSessionPwaInstallOffer,
  snoozePwaInstallPrompt,
} from "@/lib/pwa-install";

function IosInstallSteps({ t }: { t: (key: string) => string }) {
  const steps = [
    t("pwa.iosStep1"),
    t("pwa.iosStep2"),
    t("pwa.iosStep3"),
  ] as const;

  return (
    <ol className="grid gap-3 text-sm text-muted-foreground">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function consumeInstallAppQuery() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("installApp") !== "1") return false;
    url.searchParams.delete("installApp");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
    return true;
  } catch {
    return false;
  }
}

export function PwaInstallPrompt({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const [needsSafari, setNeedsSafari] = useState(false);
  const [manualHint, setManualHint] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function openPrompt() {
    if (!(await canOfferPwaInstall())) {
      setOpen(false);
      return;
    }
    setIosMode(isIosDevice());
    setNeedsSafari(needsSafariRedirectForInstall());
    setManualHint(false);
    setShareNote(null);
    setOpen(true);
  }

  useEffect(() => {
    bindPwaInstallListeners();
    registerPwaServiceWorker();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let claimed = false;
    let committed = false;
    void (async () => {
      if (!(await canOfferPwaInstall()) || cancelled) return;

      const fromQuery = consumeInstallAppQuery();
      if (!fromQuery && !isLoggedIn) return;
      if (cancelled) return;

      claimed = consumeSessionPwaInstallOffer();
      if (!claimed) {
        // Diese Session schon angeboten — Deep-Link trotzdem öffnen.
        if (fromQuery && !cancelled) await openPrompt();
        return;
      }
      if (cancelled) {
        releaseSessionPwaInstallOffer();
        return;
      }
      markSessionPwaInstallOffered();
      committed = true;
      await openPrompt();
    })();
    return () => {
      cancelled = true;
      if (claimed && !committed) releaseSessionPwaInstallOffer();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    return onPwaInstallPromptRequest(() => {
      void openPrompt();
    });
  }, []);

  function closeAndSnooze() {
    snoozePwaInstallPrompt();
    setOpen(false);
    setInstalling(false);
    setManualHint(false);
    setShareNote(null);
  }

  /** Close without snoozing so the user can use Safari’s share button. */
  function closeWithoutSnooze() {
    setOpen(false);
    setInstalling(false);
    setManualHint(false);
    setShareNote(null);
  }

  async function handleInstall() {
    if (iosMode && needsSafari) {
      const ok = openCurrentPageInSafari();
      if (!ok) {
        setShareNote(t("pwa.iosSafariOnly"));
      }
      return;
    }

    const promptEvent = getDeferredPwaPrompt();
    if (promptEvent) {
      setInstalling(true);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        clearDeferredPwaPrompt();
        if (choice.outcome === "accepted") {
          closeAndSnooze();
          return;
        }
      } catch {
        // Browser may reject prompt() outside a trusted gesture.
      }
      setInstalling(false);
      snoozePwaInstallPrompt();
      setOpen(false);
      return;
    }

    setManualHint(true);
  }

  const iosSafariGuide = iosMode && !needsSafari;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (iosSafariGuide && manualHint) {
            closeWithoutSnooze();
          } else {
            closeAndSnooze();
          }
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <div className="mb-1">
            <ClubLogo variant="icon" href={null} className="size-10" />
          </div>
          <DialogTitle>{t("pwa.title")}</DialogTitle>
          <DialogDescription>{t("pwa.description")}</DialogDescription>
        </DialogHeader>

        {manualHint && iosSafariGuide ? <IosInstallSteps t={t} /> : null}

        {shareNote ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {shareNote}
          </p>
        ) : null}

        {manualHint && !iosMode ? (
          <p className="text-sm text-muted-foreground">{t("pwa.manualHint")}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeAndSnooze}>
            {t("pwa.later")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing}
          >
            {installing ? t("pwa.installing") : t("pwa.install")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
