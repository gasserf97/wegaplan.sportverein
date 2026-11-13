/**
 * Render Cron start command: hits the web app renewals endpoint and exits.
 * Env: NEXT_PUBLIC_APP_URL (or CRON_TARGET_URL), CRON_SECRET (same as web service).
 */
function cleanSecret(raw) {
  let value = (raw ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(value)) {
    value = value.replace(/^bearer\s+/i, "").trim();
  }
  return value;
}

const base = (
  process.env.CRON_TARGET_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  ""
)
  .trim()
  .replace(/\/$/, "");

if (!base) {
  console.error(
    "Missing CRON_TARGET_URL or NEXT_PUBLIC_APP_URL for renewals cron.",
  );
  process.exit(1);
}

const secret = cleanSecret(process.env.CRON_SECRET);
if (!secret) {
  console.error(
    "CRON_SECRET fehlt beim Cron-Job asclajen-renewals. In Render denselben Wert wie beim Web-Service asclajen eintragen (Environment → CRON_SECRET).",
  );
  process.exit(1);
}

const url = `${base}/api/cron/renew-subscriptions`;
const headers = {
  Authorization: `Bearer ${secret}`,
  "X-Cron-Secret": secret,
};

const response = await fetch(url, { headers, cache: "no-store" });
const body = await response.text();
console.log(`renewals cron ${response.status}: ${body.slice(0, 500)}`);

if (!response.ok) {
  process.exit(1);
}
