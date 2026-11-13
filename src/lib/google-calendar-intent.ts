/**
 * Android: cid-Links auf calendar.google.com öffnen die Kalender-App (App Links)
 * – dort scheitert das Abo. Zuverlässig: HTTPS-Feed kopieren und die Seite
 * „Kalender per URL“ in Chrome öffnen.
 */
export const GOOGLE_CALENDAR_ADDBYURL =
  "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

export function googleCalendarChromeIntent(httpsUrl: string) {
  const body = httpsUrl.replace(/^https:\/\//i, "");
  return `intent://${body}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
}

export function googleCalendarAddByUrlChromeIntent() {
  return googleCalendarChromeIntent(GOOGLE_CALENDAR_ADDBYURL);
}
