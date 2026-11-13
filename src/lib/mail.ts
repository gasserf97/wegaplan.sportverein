import { PASSWORD_RESET_HOURS } from "@/lib/password-reset-config";

export type MailDeliveryResult =
  | { sent: true; messageId?: string; provider: MailProvider }
  | { sent: false; message: string };

export type MailProvider = "brevo" | "resend" | "smtp";

export type MailStatus = {
  configured: boolean;
  provider: MailProvider | null;
  fromAddress: string | null;
  issue: string | null;
  warnings: string[];
};

const BLOCKED_RECIPIENT_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test",
  "localhost",
  "invalid",
]);

const SMTP_TIMEOUT_MS = 12_000;

/** Read env and strip accidental surrounding quotes from Render/.env copy-paste. */
function env(name: string) {
  let value = process.env[name]?.trim() ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function smtpPass() {
  return env("SMTP_PASS") || env("SMTP_PASSWORD");
}

function parseFromAddress(raw: string): { name?: string; email: string } | null {
  const angle = raw.match(/^(.*)<([^>]+)>$/);
  if (angle) {
    const email = angle[2].trim();
    const name = angle[1].trim().replace(/^"|"$/g, "");
    if (!email.includes("@")) return null;
    return name ? { name, email } : { email };
  }
  if (raw.includes("@")) return { email: raw.trim() };
  return null;
}

/** Rejects placeholder / demo addresses that providers refuse. */
export function isSendableEmail(email: string | null | undefined) {
  const value = email?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  if (/\.local$/i.test(value)) return false;
  const host = value.split("@")[1]?.toLowerCase() ?? "";
  if (BLOCKED_RECIPIENT_HOSTS.has(host)) return false;
  if (host.endsWith(".example") || host.endsWith(".test")) return false;
  return true;
}

function smtpHostSet() {
  return Boolean(env("SMTP_HOST"));
}

function smtpReady() {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && smtpPass());
}

function brevoReady() {
  return Boolean(env("BREVO_API_KEY") && resolveFromRaw());
}

function resendReady() {
  return Boolean(env("RESEND_API_KEY") && resolveFromRaw());
}

function resolveFromRaw() {
  const configured = env("MAIL_FROM");
  if (configured) return configured;
  const smtpUser = env("SMTP_USER");
  if (smtpUser.includes("@")) return `ASC Lajen <${smtpUser}>`;
  return "";
}

/**
 * Prefer HTTPS APIs (Brevo/Resend). SMTP often hangs on Render free tier
 * because outbound ports 25/465/587 are blocked.
 */
function mailProvider(): MailProvider | null {
  const forced = env("MAIL_PROVIDER").toLowerCase();
  if (forced === "brevo" || forced === "resend" || forced === "smtp") {
    return forced;
  }
  if (brevoReady()) return "brevo";
  if (resendReady()) return "resend";
  if (smtpHostSet() || smtpReady()) return "smtp";
  return null;
}

export function isMailConfigured() {
  const provider = mailProvider();
  if (provider === "brevo") return brevoReady();
  if (provider === "resend") return resendReady();
  if (provider === "smtp") return smtpReady();
  return false;
}

/** Human-readable hint when mail is not ready (shown in UI). */
export function mailConfigIssue(): string | null {
  if (isMailConfigured()) return null;

  if (env("MAIL_PROVIDER").toLowerCase() === "brevo" || env("BREVO_API_KEY")) {
    if (!env("BREVO_API_KEY")) return "BREVO_API_KEY fehlt in Render.";
    if (!resolveFromRaw()) {
      return "MAIL_FROM fehlt (z. B. ASC Lajen <app@asclajen.com>) – Absender/Domain in Brevo verifizieren.";
    }
  }

  if (env("MAIL_PROVIDER").toLowerCase() === "smtp" || smtpHostSet()) {
    const missingSmtp = [
      !env("SMTP_HOST") ? "SMTP_HOST" : null,
      !env("SMTP_USER") ? "SMTP_USER" : null,
      !smtpPass() ? "SMTP_PASS" : null,
    ].filter(Boolean) as string[];
    if (missingSmtp.length > 0) {
      return `Gmail/SMTP unvollständig – in Render fehlt noch: ${missingSmtp.join(", ")}. Hinweis: Auf Render Free ist SMTP oft blockiert – besser BREVO_API_KEY (HTTPS) nutzen.`;
    }
  }

  if (env("RESEND_API_KEY") && !env("MAIL_FROM")) {
    return "RESEND_API_KEY ist gesetzt, aber MAIL_FROM fehlt (verifizierte Domain, nicht @gmail.com).";
  }

  return "E-Mail nicht konfiguriert. Empfohlen auf Render: BREVO_API_KEY + MAIL_FROM (z. B. ASC Lajen <app@asclajen.com>, Domain in Brevo verifizieren). SMTP von Render Free hängt meist.";
}

function mailFromEmail(): string | null {
  const parsed = parseFromAddress(resolveFromRaw());
  return parsed?.email.toLowerCase() ?? null;
}

function collectMailWarnings(provider: MailProvider | null): string[] {
  const warnings: string[] = [];
  const from = mailFromEmail();
  if (!provider || !from) return warnings;

  if (provider === "resend") {
    if (from.endsWith("@gmail.com") || from.endsWith("@googlemail.com")) {
      warnings.push(
        "Resend erlaubt keinen @gmail.com-Absender. Brevo nutzen (BREVO_API_KEY + MAIL_FROM) oder eine bei Resend verifizierte Domain.",
      );
    }
    if (from === "onboarding@resend.dev") {
      warnings.push(
        "Test-Absender onboarding@resend.dev: Resend liefert nur an die E-Mail des Resend-Kontos – nicht an Mitglieder.",
      );
    }
  }

  if (provider === "smtp") {
    warnings.push(
      "SMTP auf Render Free ist oft blockiert. Besser BREVO_API_KEY (HTTPS) nutzen.",
    );
  }

  return warnings;
}

/** Status for admin UI – no secrets. */
export function getMailStatus(): MailStatus {
  const provider = mailProvider();
  const configured = isMailConfigured();
  const fromAddress = mailFromEmail();
  const issue = configured ? null : mailConfigIssue();
  const warnings = collectMailWarnings(provider);
  if (configured && provider === "brevo") {
    warnings.push(
      "Bei Zustellproblemen: Absender in Brevo prüfen und Spam-Ordner des Empfängers kontrollieren.",
    );
  }
  return { configured, provider, fromAddress, issue, warnings };
}

function validateFromForProvider(
  provider: MailProvider,
  from: string,
): MailDeliveryResult | null {
  const parsed = parseFromAddress(from);
  if (!parsed) {
    return {
      sent: false,
      message:
        "MAIL_FROM fehlt oder ist ungültig (z. B. ASC Lajen <app@asclajen.com>).",
    };
  }
  const email = parsed.email.toLowerCase();
  if (
    provider === "resend" &&
    (email.endsWith("@gmail.com") || email.endsWith("@googlemail.com"))
  ) {
    return {
      sent: false,
      message:
        "Resend erlaubt keinen @gmail.com-Absender. In Render BREVO_API_KEY + MAIL_PROVIDER=brevo setzen oder eine verifizierte Domain bei Resend nutzen.",
    };
  }
  return null;
}

function getMailFrom(): MailDeliveryResult | { from: string } {
  const raw = resolveFromRaw();
  if (!raw || !parseFromAddress(raw)) {
    return {
      sent: false,
      message:
        "MAIL_FROM fehlt oder ist ungültig (z. B. ASC Lajen <app@asclajen.com>).",
    };
  }
  return { from: raw };
}

async function parseJsonError(response: Response, fallbackPrefix: string) {
  const fallback = `${fallbackPrefix} HTTP ${response.status}`;
  const text = await response.text();
  try {
    const data = JSON.parse(text) as {
      message?: string;
      error?: string | { message?: string };
    };
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    if (data.error && typeof data.error === "object" && data.error.message) {
      return data.error.message;
    }
    return text.slice(0, 300) || fallback;
  } catch {
    return text.slice(0, 300) || fallback;
  }
}

function friendlyProviderMessage(detail: string) {
  if (/ETIMEDOUT|timeout|ESOCKET|ENETUNREACH|ECONNREFUSED/i.test(detail)) {
    return "SMTP-Verbindung hängt/timeout – Render Free blockiert Ports 587/465. Bitte BREVO_API_KEY (HTTPS) nutzen oder Render auf einen bezahlten Plan upgraden.";
  }
  if (/not verified|gmail\.com domain/i.test(detail)) {
    return "Absender-Domain nicht verifiziert. Bei Brevo Domain asclajen.com (oder Absender app@asclajen.com) freischalten; bei Resend die Domain verifizieren.";
  }
  if (/example\.com|testing email/i.test(detail)) {
    return "Demo-Adressen (@example.com) werden abgelehnt. Bitte eine echte Empfänger-E-Mail im Profil hinterlegen.";
  }
  return detail;
}

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type OutgoingMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

function brevoAttachmentPayload(attachments?: MailAttachment[]) {
  if (!attachments?.length) return undefined;
  return attachments.map((item) => ({
    name: item.filename,
    content: item.content.toString("base64"),
  }));
}

function resendAttachmentPayload(attachments?: MailAttachment[]) {
  if (!attachments?.length) return undefined;
  return attachments.map((item) => ({
    filename: item.filename,
    content: item.content.toString("base64"),
    content_type: item.contentType ?? "application/pdf",
  }));
}

async function sendViaBrevo(options: OutgoingMail): Promise<MailDeliveryResult> {
  const apiKey = env("BREVO_API_KEY");
  const sender = parseFromAddress(options.from);
  if (!apiKey || !sender) {
    return { sent: false, message: mailConfigIssue() ?? "Brevo unvollständig." };
  }

  const attachment = brevoAttachmentPayload(options.attachments);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: sender.name
        ? { name: sender.name, email: sender.email }
        : { email: sender.email },
      replyTo: { email: sender.email, name: sender.name ?? "ASC Lajen" },
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text,
      ...(attachment ? { attachment } : {}),
    }),
  });

  if (!response.ok) {
    const detail = friendlyProviderMessage(
      await parseJsonError(response, "Brevo"),
    );
    console.error("Brevo", response.status, detail);
    return {
      sent: false,
      message: `E-Mail-Versand fehlgeschlagen: ${detail}`,
    };
  }
  let messageId: string | undefined;
  try {
    const data = (await response.json()) as { messageId?: string };
    messageId = data.messageId;
  } catch {
    // body optional
  }
  console.info("Brevo gesendet", options.to, messageId ?? "ok");
  return { sent: true, messageId, provider: "brevo" };
}

async function sendViaSmtp(options: OutgoingMail): Promise<MailDeliveryResult> {
  if (!smtpReady()) {
    return {
      sent: false,
      message: mailConfigIssue() ?? "SMTP unvollständig konfiguriert.",
    };
  }

  try {
    const nodemailer = await import("nodemailer");
    const createTransport =
      nodemailer.createTransport ?? nodemailer.default.createTransport;
    const port = Number(env("SMTP_PORT") || "587");
    const transporter = createTransport({
      host: env("SMTP_HOST"),
      port,
      secure: port === 465,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      auth: {
        user: env("SMTP_USER"),
        pass: smtpPass(),
      },
    });

    const sendPromise = transporter.sendMail({
      from: options.from,
      replyTo: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map((item) => ({
        filename: item.filename,
        content: item.content,
        contentType: item.contentType ?? "application/pdf",
      })),
    });

    await Promise.race([
      sendPromise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `SMTP timeout after ${SMTP_TIMEOUT_MS}ms (Render blockiert oft Port ${port})`,
            ),
          );
        }, SMTP_TIMEOUT_MS + 1000);
      }),
    ]);

    console.info("SMTP gesendet", options.to);
    return { sent: true, provider: "smtp" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SMTP-Versand fehlgeschlagen.";
    console.error("SMTP", message);
    return {
      sent: false,
      message: `E-Mail-Versand fehlgeschlagen: ${friendlyProviderMessage(message)}`,
    };
  }
}

async function sendViaResend(options: OutgoingMail): Promise<MailDeliveryResult> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    return { sent: false, message: "RESEND_API_KEY fehlt." };
  }

  const attachments = resendAttachmentPayload(options.attachments);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      reply_to: parseFromAddress(options.from)?.email,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      ...(attachments ? { attachments } : {}),
    }),
  });
  if (!response.ok) {
    const detail = friendlyProviderMessage(
      await parseJsonError(response, "Resend"),
    );
    console.error("Resend", response.status, detail);
    return {
      sent: false,
      message: `E-Mail-Versand fehlgeschlagen: ${detail}`,
    };
  }
  let messageId: string | undefined;
  try {
    const data = (await response.json()) as { id?: string };
    messageId = data.id;
  } catch {
    // body optional
  }
  console.info("Resend gesendet", options.to, messageId ?? "ok");
  return { sent: true, messageId, provider: "resend" };
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}): Promise<MailDeliveryResult> {
  if (!isSendableEmail(options.to)) {
    return {
      sent: false,
      message:
        "Ungültige oder Demo-Empfängeradresse (z. B. @example.com). Bitte eine echte E-Mail im Profil hinterlegen.",
    };
  }

  const provider = mailProvider();
  if (!provider || !isMailConfigured()) {
    return {
      sent: false,
      message:
        mailConfigIssue() ??
        "E-Mail-Versand ist nicht konfiguriert.",
    };
  }

  const fromResult = getMailFrom();
  if ("sent" in fromResult) return fromResult;

  const fromValidation = validateFromForProvider(provider, fromResult.from);
  if (fromValidation) return fromValidation;

  if (provider === "brevo") {
    return sendViaBrevo({ from: fromResult.from, ...options });
  }
  if (provider === "resend") {
    return sendViaResend({ from: fromResult.from, ...options });
  }
  return sendViaSmtp({ from: fromResult.from, ...options });
}

export async function sendVerificationEmail(to: string, confirmUrl: string) {
  const subject = "Bitte bestätigen Sie Ihre E-Mail – ASC Lajen";
  const text = `Guten Tag,\n\nbitte bestätigen Sie Ihre E-Mail-Adresse für den ASC Lajen und legen Sie danach Ihr Passwort fest:\n${confirmUrl}\n\nDer Link gilt 48 Stunden.\n\nASC Lajen Raiffeisen`;
  const href = confirmUrl.replace(/&/g, "&amp;");
  const html = `<p>Guten Tag,</p><p>bitte bestätigen Sie Ihre E-Mail-Adresse für den ASC Lajen und legen Sie danach Ihr Passwort fest:</p><p><a href="${href}">E-Mail bestätigen und Passwort setzen</a></p><p>Der Link gilt 48 Stunden.</p><p>ASC Lajen Raiffeisen</p>`;
  return sendMail({ to, subject, text, html });
}

export async function sendAccountInviteEmail(
  to: string,
  name: string,
  confirmUrl: string,
) {
  const subject = "Ihr Familienkonto beim ASC Lajen";
  const safeName = name.trim() || "Mitglied";
  const text = `Guten Tag ${safeName},\n\nfür Sie wurde ein Zugang zum Familienkonto beim ASC Lajen angelegt.\nBitte öffnen Sie den Link und legen Sie Ihr Passwort fest:\n${confirmUrl}\n\nDer Link gilt 48 Stunden.\n\nASC Lajen Raiffeisen`;
  const href = confirmUrl.replace(/&/g, "&amp;");
  const html = `<p>Guten Tag ${safeName.replace(/</g, "&lt;")},</p><p>für Sie wurde ein Zugang zum Familienkonto beim ASC Lajen angelegt.</p><p>Bitte öffnen Sie den Link und legen Sie Ihr Passwort fest:</p><p><a href="${href}">Passwort festlegen und anmelden</a></p><p>Der Link gilt 48 Stunden.</p><p>ASC Lajen Raiffeisen</p>`;
  return sendMail({ to, subject, text, html });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const subject = "Passwort zurücksetzen – ASC Lajen";
  const text = `Guten Tag,\n\nSie haben ein neues Passwort für den ASC Lajen angefordert. Öffnen Sie den Link und legen Sie ein neues Passwort fest:\n${resetUrl}\n\nDer Link gilt ${PASSWORD_RESET_HOURS} Stunden. Wenn Sie das nicht waren, können Sie diese E-Mail ignorieren.\n\nASC Lajen Raiffeisen`;
  const href = resetUrl.replace(/&/g, "&amp;");
  const html = `<p>Guten Tag,</p><p>Sie haben ein neues Passwort für den ASC Lajen angefordert. Öffnen Sie den Link und legen Sie ein neues Passwort fest:</p><p><a href="${href}">Neues Passwort festlegen</a></p><p>Der Link gilt ${PASSWORD_RESET_HOURS} Stunden. Wenn Sie das nicht waren, können Sie diese E-Mail ignorieren.</p><p>ASC Lajen Raiffeisen</p>`;
  return sendMail({ to, subject, text, html });
}

export async function passwordResetLink(token: string, nextPath?: string) {
  const { getAppUrl } = await import("@/lib/stripe");
  const appUrl = await getAppUrl();
  const params = new URLSearchParams();
  params.set("token", token);
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    params.set("next", nextPath);
  }
  return `${appUrl}/passwort-zuruecksetzen?${params.toString()}`;
}

export async function verificationLink(token: string, nextPath?: string) {
  const { getAppUrl } = await import("@/lib/stripe");
  const appUrl = await getAppUrl();
  const params = new URLSearchParams();
  params.set("token", token);
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    params.set("next", nextPath);
  }
  // Query-Param: JWT enthält Punkte – im Pfad oft problematisch für Mail-Tracker.
  return `${appUrl}/bestaetigen?${params.toString()}`;
}
