import { createHash, timingSafeEqual } from "node:crypto";

/** Strip copy-paste quotes and an accidental Bearer prefix. */
export function cleanCronSecret(raw: string | undefined | null) {
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

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export function cronSecretsMatch(expected: string, presented: string) {
  if (!expected || !presented) return false;
  return timingSafeEqual(sha256(expected), sha256(presented));
}

export function cronSecretFromRequest(request: Request) {
  const headerSecret = cleanCronSecret(request.headers.get("x-cron-secret"));
  if (headerSecret) return headerSecret;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return cleanCronSecret(bearer[1]);

  return "";
}

/** null = authorized (or CRON_SECRET unset for local). */
export function cronUnauthorizedResponse(request: Request): Response | null {
  const expected = cleanCronSecret(process.env.CRON_SECRET);
  if (!expected) return null;
  const presented = cronSecretFromRequest(request);
  if (cronSecretsMatch(expected, presented)) return null;
  return new Response(
    "Unauthorized: CRON_SECRET des Cron-Jobs stimmt nicht mit dem Web-Service überein.",
    { status: 401 },
  );
}
