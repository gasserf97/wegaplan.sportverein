import { cookies } from "next/headers";
import type { Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";

export const LOCALE_COOKIE = "locale";

export function parseLocale(value: string | undefined | null): Locale {
  return value === "it" ? "it" : DEFAULT_LOCALE;
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export { localeToIntlTag } from "./intl";