import type { Locale } from "./types";

export function localeToIntlTag(locale: Locale): string {
  return locale === "it" ? "it-IT" : "de-DE";
}
