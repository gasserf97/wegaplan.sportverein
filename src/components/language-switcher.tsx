"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/app/actions/locale";
import type { Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { useI18n } from "./locale-provider";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 text-xs font-medium",
        pending && "opacity-60",
        className,
      )}
      role="group"
      aria-label={locale === "it" ? "Lingua" : "Sprache"}
    >
      <button
        type="button"
        onClick={() => switchLocale("de")}
        className={cn(
          "rounded px-2 py-1 transition-colors",
          locale === "de"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={locale === "de"}
      >
        DE
      </button>
      <button
        type="button"
        onClick={() => switchLocale("it")}
        className={cn(
          "rounded px-2 py-1 transition-colors",
          locale === "it"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={locale === "it"}
      >
        IT
      </button>
    </div>
  );
}
