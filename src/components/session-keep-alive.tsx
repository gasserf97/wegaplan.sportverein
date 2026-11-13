"use client";

import { useEffect } from "react";
import { refreshSessionAction } from "@/app/actions/session";

/** Klicks und Tastatureingaben setzen die 30-Tage-Frist neu, auch ohne Seitenwechsel. */
export function SessionKeepAlive({ refreshAfterMs }: { refreshAfterMs: number }) {
  useEffect(() => {
    let lastRefreshAt = Date.now();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastRefreshAt < refreshAfterMs) return;
      lastRefreshAt = now;
      void refreshSessionAction();
    };

    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [refreshAfterMs]);

  return null;
}
