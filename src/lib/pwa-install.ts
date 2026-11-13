const PROMPT_KEY = "asc-lajen-pwa-prompt";
/** Einmal pro Browser-Session: Auto-Dialog bereits angeboten. */
const SESSION_OFFERED_KEY = "asc-lajen-pwa-session-offered";
const SNOOZE_UNTIL_KEY = "asc-lajen-pwa-snooze-until";
/** Dauerhaft: App wurde installiert (auch im normalen Browser nicht mehr anbieten). */
const INSTALLED_KEY = "asc-lajen-pwa-installed-v2";
/** Alte Keys: v1 konnte fälschlich gesetzt werden (android-app:// Referrer aus Google App o.ä.). */
const LEGACY_INSTALLED_KEYS = ["asc-lajen-pwa-installed"] as const;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listenersBound = false;
let relatedAppsInstalled = false;

export function getDeferredPwaPrompt() {
  return deferredPrompt;
}

export function clearDeferredPwaPrompt() {
  deferredPrompt = null;
}

export function markPwaInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
    for (const key of LEGACY_INSTALLED_KEYS) {
      localStorage.removeItem(key);
    }
    sessionStorage.removeItem(PROMPT_KEY);
  } catch {
    // Private mode or disabled storage.
  }
  deferredPrompt = null;
  relatedAppsInstalled = true;
}

function clearPwaInstalledMark() {
  relatedAppsInstalled = false;
  try {
    localStorage.removeItem(INSTALLED_KEY);
    for (const key of LEGACY_INSTALLED_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Private mode or disabled storage.
  }
}

function isPwaMarkedInstalled() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function bindPwaInstallListeners() {
  if (typeof window === "undefined" || listenersBound) return;
  listenersBound = true;

  if (isStandalonePwa()) {
    markPwaInstalled();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    // Bereits installiert → Event nicht speichern, Hinweis nicht anbieten.
    if (isPwaAlreadyInstalledSync()) {
      event.preventDefault();
      deferredPrompt = null;
      return;
    }
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markPwaInstalled();
    snoozePwaInstallPrompt();
  });

  // Beim Öffnen der installierten App (Standalone) dauerhaft merken.
  const media = window.matchMedia("(display-mode: standalone)");
  const markIfStandalone = () => {
    if (isStandalonePwa()) markPwaInstalled();
  };
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", markIfStandalone);
  } else if (typeof media.addListener === "function") {
    media.addListener(markIfStandalone);
  }

  void refreshInstalledRelatedApps();
}

function isPwaInstallSnoozed() {
  try {
    const raw = localStorage.getItem(SNOOZE_UNTIL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) {
      localStorage.removeItem(SNOOZE_UNTIL_KEY);
      return false;
    }
    if (Date.now() < until) return true;
    // Snooze abgelaufen: auch ohne Neu-Login wieder anbieten dürfen.
    localStorage.removeItem(SNOOZE_UNTIL_KEY);
    sessionStorage.removeItem(SESSION_OFFERED_KEY);
    return false;
  } catch {
    return false;
  }
}

export function markPwaInstallPromptPending() {
  try {
    if (!isMobileDevice() || isPwaInstallSnoozed() || isPwaAlreadyInstalledSync()) {
      return;
    }
    sessionStorage.setItem(PROMPT_KEY, "pending");
  } catch {
    // Private mode or disabled storage.
  }
}

/** Returns true once, then clears the pending flag. */
export function consumePwaInstallPromptPending() {
  try {
    if (isPwaInstallSnoozed() || isPwaAlreadyInstalledSync()) {
      sessionStorage.removeItem(PROMPT_KEY);
      return false;
    }
    if (sessionStorage.getItem(PROMPT_KEY) !== "pending") return false;
    sessionStorage.removeItem(PROMPT_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Verhindert Doppel-Claim bei React Strict Mode / schnellem Remount. */
let sessionOfferInFlight = false;

/**
 * Auto-Dialog einmal pro Browser-Session für eingeloggte Nutzer:
 * - kein aktuelles „Später erinnern“ (14 Tage)
 * - App nicht installiert
 * Nach Ablauf der 14 Tage wieder, auch ohne Neu-Login (nur Seitenaufruf reicht).
 * Nach true: entweder markSessionPwaInstallOffered() oder releaseSessionPwaInstallOffer().
 */
export function consumeSessionPwaInstallOffer(): boolean {
  try {
    if (isPwaInstallSnoozed() || isPwaAlreadyInstalledSync()) {
      sessionStorage.removeItem(PROMPT_KEY);
      return false;
    }
    if (sessionStorage.getItem(SESSION_OFFERED_KEY) === "1") return false;
    if (sessionOfferInFlight) return false;
    sessionOfferInFlight = true;
    return true;
  } catch {
    return false;
  }
}

export function markSessionPwaInstallOffered() {
  sessionOfferInFlight = false;
  try {
    sessionStorage.setItem(SESSION_OFFERED_KEY, "1");
    sessionStorage.removeItem(PROMPT_KEY);
  } catch {
    // Private mode or disabled storage.
  }
}

export function releaseSessionPwaInstallOffer() {
  sessionOfferInFlight = false;
}

export function snoozePwaInstallPrompt() {
  try {
    localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
    sessionStorage.removeItem(PROMPT_KEY);
    sessionStorage.setItem(SESSION_OFFERED_KEY, "1");
  } catch {
    // Private mode or disabled storage.
  }
  sessionOfferInFlight = false;
}

export function isPwaInstallPromptPending() {
  try {
    if (isPwaInstallSnoozed() || isPwaAlreadyInstalledSync()) return false;
    return sessionStorage.getItem(PROMPT_KEY) === "pending";
  } catch {
    return false;
  }
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // Nur echte Install-/Display-Modes. Nicht document.referrer "android-app://":
  // das setzen auch Google App, Custom Tabs usw. beim Öffnen der Website.
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches
  );
}

/** Sync: Standalone, dauerhaftes Flag, bereits bekanntes Related-Apps-Ergebnis. */
export function isPwaAlreadyInstalledSync() {
  if (typeof window === "undefined") return false;
  if (isStandalonePwa()) {
    markPwaInstalled();
    return true;
  }
  if (isPwaMarkedInstalled() || relatedAppsInstalled) return true;
  return false;
}

type RelatedApp = { platform?: string; url?: string; id?: string };

/**
 * Chromium (Android): erkennt, ob die PWA bereits installiert ist,
 * auch wenn die Seite gerade im normalen Browser offen ist.
 */
export async function refreshInstalledRelatedApps() {
  if (typeof window === "undefined") return false;
  if (isStandalonePwa()) {
    markPwaInstalled();
    return true;
  }
  if (relatedAppsInstalled) return true;

  const nav = window.navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
  };
  if (typeof nav.getInstalledRelatedApps !== "function") {
    return isPwaMarkedInstalled();
  }

  try {
    const apps = await nav.getInstalledRelatedApps();
    const origin = window.location.origin;
    const installed = apps.some((app) => {
      if (app.platform === "webapp") return true;
      if (typeof app.url !== "string") return false;
      try {
        const url = new URL(app.url, origin);
        return (
          url.origin === origin &&
          (url.pathname.includes("manifest") || url.pathname === "/")
        );
      } catch {
        return app.url.includes("manifest");
      }
    });
    if (installed || apps.length > 0) {
      // Jede Related App von dieser Origin bedeutet: PWA/App ist da.
      markPwaInstalled();
      return true;
    }
    // API sagt: nicht installiert — altes/falsches Flag löschen.
    clearPwaInstalledMark();
    return false;
  } catch {
    // API nicht verfügbar oder blockiert.
  }
  return isPwaMarkedInstalled();
}

/** Phones/tablets only — never show install UI on desktop. */
export function isMobileDevice() {
  if (typeof window === "undefined") return false;
  if (isIosDevice()) return true;
  const nav = window.navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  if (typeof nav.userAgentData?.mobile === "boolean") {
    return nav.userAgentData.mobile;
  }
  return /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    nav.userAgent,
  );
}

export function shouldOfferPwaInstall() {
  return isMobileDevice() && !isPwaAlreadyInstalledSync();
}

/** Async Variante: prüft zusätzlich getInstalledRelatedApps(). */
export async function canOfferPwaInstall() {
  if (!isMobileDevice()) return false;
  if (await refreshInstalledRelatedApps()) {
    try {
      sessionStorage.removeItem(PROMPT_KEY);
    } catch {
      // ignore
    }
    return false;
  }
  return !isPwaAlreadyInstalledSync();
}

export function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
}

export function isIosSafari() {
  if (!isIosDevice()) return false;
  const ua = window.navigator.userAgent;
  // Chrome, Firefox, Edge, Google App, and social in-app browsers cannot install PWAs.
  if (
    /CriOS|FxiOS|OPiOS|EdgiOS|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp/i.test(
      ua,
    )
  ) {
    return false;
  }
  return /WebKit/i.test(ua);
}

/** Google App, Chrome, Instagram, etc. — cannot add to Home Screen here. */
export function needsSafariRedirectForInstall() {
  return isIosDevice() && !isIosSafari();
}

/**
 * Opens the current page in Safari (iOS). Used from Google App / Chrome / in-app browsers.
 * Returns false if the scheme is unavailable.
 */
export function openCurrentPageInSafari(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("installApp", "1");
    // iOS URL scheme that hands off to Safari.
    const safariHref = `x-safari-https://${url.host}${url.pathname}${url.search}${url.hash}`;
    window.location.href = safariHref;
    return true;
  } catch {
    return false;
  }
}

const OPEN_PROMPT_EVENT = "asc-lajen-open-pwa-install";

export function requestPwaInstallPrompt() {
  if (typeof window === "undefined") return;
  void (async () => {
    if (!(await canOfferPwaInstall())) return;
    window.dispatchEvent(new Event(OPEN_PROMPT_EVENT));
  })();
}

export function onPwaInstallPromptRequest(handler: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(OPEN_PROMPT_EVENT, handler);
  return () => window.removeEventListener(OPEN_PROMPT_EVENT, handler);
}

export function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
    return;
  }
  void navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

if (typeof window !== "undefined") {
  bindPwaInstallListeners();
}
