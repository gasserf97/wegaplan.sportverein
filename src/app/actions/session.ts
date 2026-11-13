"use server";

import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  renewedSessionToken,
  sessionCookieOptions,
  sessionCookieSecure,
} from "@/lib/session-token";

/** Verlängert die Sitzung, wenn die letzte Verlängerung schon etwas her ist. */
export async function refreshSessionAction() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  const renewed = await renewedSessionToken(token);
  if (!renewed) return;

  store.set(SESSION_COOKIE_NAME, renewed, {
    ...sessionCookieOptions(),
    secure: sessionCookieSecure(),
  });
}
