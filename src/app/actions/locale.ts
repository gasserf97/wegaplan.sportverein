"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/types";

export async function setLocaleAction(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365 * 10,
    path: "/",
    sameSite: "lax",
  });
}
