"use client";

import { useEffect } from "react";
import { rememberClientChannel } from "@/lib/client-channel";

/** Schreibt bei jedem Seitenaufruf, ob die installierte Web-App oder der Browser offen ist. */
export function ClientChannelCookie() {
  useEffect(() => {
    rememberClientChannel();
  }, []);

  return null;
}
