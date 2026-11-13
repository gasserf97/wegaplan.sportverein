"use client";

import { useEffect, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { useI18n } from "@/components/locale-provider";
import {
  canOfferPwaInstall,
  requestPwaInstallPrompt,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

export function PwaInstallMenuItem({
  className,
  onSelect,
}: {
  className?: string;
  onSelect?: () => void;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const offer = await canOfferPwaInstall();
      if (!cancelled) setVisible(offer);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className={cn("text-left", className)}
      onClick={() => {
        onSelect?.();
        requestPwaInstallPrompt();
      }}
    >
      <span className="inline-flex items-center gap-2">
        <DownloadIcon className="size-4 shrink-0" aria-hidden />
        {t("pwa.navInstall")}
      </span>
    </button>
  );
}
