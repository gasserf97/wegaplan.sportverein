import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

function secretKey() {
  const raw = (
    process.env.CLUB_SECRETS_KEY ||
    process.env.AUTH_SECRET ||
    ""
  ).trim();
  if (!raw) {
    throw new Error("CLUB_SECRETS_KEY oder AUTH_SECRET fehlt.");
  }
  return scryptSync(raw, "club-secrets-v1", 32);
}

export function encryptSecret(plain: string) {
  const value = plain.trim();
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const raw = payload.trim();
  if (!raw) return "";
  try {
    const buf = Buffer.from(raw, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return "";
  }
}
