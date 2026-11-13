"use client";

import { createContext, useContext, useMemo } from "react";
import { getTranslator } from "@/lib/i18n/translator";
import type { Locale, TFunction } from "@/lib/i18n/types";

const LocaleContext = createContext<{
  locale: Locale;
  t: TFunction;
} | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: getTranslator(locale) }),
    [locale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return ctx;
}
