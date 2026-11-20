"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supportNotifyEmailSetting, clubDisplayName } from "@/lib/club-settings";
import { requireCurrentClubId, platformBaseUrl } from "@/lib/tenant";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { isMailConfigured, isSendableEmail, sendMail } from "@/lib/mail";
import { CLUB_TIMEZONE } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/stripe";

const ticketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, { error: "Bitte einen Betreff mit mindestens 3 Zeichen angeben." })
    .max(120),
  message: z
    .string()
    .trim()
    .min(10, {
      error:
        "Bitte die Nachricht etwas ausführlicher beschreiben (mindestens 10 Zeichen).",
    })
    .max(5000),
});

const TICKET_DAY_TIMEZONE = CLUB_TIMEZONE;

function calendarDayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Beansprucht den Tages-Slot für die Benachrichtigung (einmal pro Kalendertag). */
async function ticketDayKey(date: Date) {
  const clubId = await requireCurrentClubId();
  return `${clubId}:${calendarDayKey(date, TICKET_DAY_TIMEZONE)}`;
}

async function claimDailyTicketNotifySlot(dayKey: string, ticketId: string) {
  try {
    await prisma.supportTicketDailyNotify.create({
      data: { dayKey, ticketId },
    });
    return true;
  } catch (error) {
    // Nur „bereits belegt“ = heute schon benachrichtigt. Andere Fehler (z. B. fehlende
    // Migration) nicht als Skip werten – sonst bleibt die Mail für immer aus.
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

async function releaseDailyTicketNotifySlot(dayKey: string) {
  await prisma.supportTicketDailyNotify
    .delete({ where: { dayKey } })
    .catch(() => undefined);
}

async function notifyFirstSupportTicketOfDay(input: {
  ticketId: string;
  subject: string;
  message: string;
  memberName: string;
  username: string;
  createdAt: Date;
}) {
  const dayKey = await ticketDayKey(input.createdAt);
  // Test-Hatch: Betreff mit [Force-Notify] gibt den Tages-Slot wieder frei (nur zum Prüfen).
  if (input.subject.trim().startsWith("[Force-Notify]")) {
    await releaseDailyTicketNotifySlot(dayKey);
  }
  let claimed: boolean;
  let markerAvailable = true;
  try {
    claimed = await claimDailyTicketNotifySlot(dayKey, input.ticketId);
  } catch (error) {
    // z. B. Tabelle noch nicht migriert – trotzdem einmal versuchen zu senden
    markerAvailable = false;
    claimed = true;
    console.error(
      "Ticket-Tagesmarker fehlgeschlagen – Mail wird trotzdem versucht.",
      error,
    );
  }
  if (!claimed) {
    console.info(
      "Ticket-Benachrichtigung übersprungen – heute bereits versendet.",
      dayKey,
    );
    return;
  }

  const notifyTo = await supportNotifyEmailSetting();
  const club = await clubDisplayName();
  if (!(await isMailConfigured()) || !notifyTo) {
    console.warn("Ticket-Benachrichtigung: E-Mail nicht konfiguriert.");
    if (markerAvailable) await releaseDailyTicketNotifySlot(dayKey);
    return;
  }

  const ticketsUrl = `${await getAppUrl()}/admin/tickets`;
  const subject = `${club} – neues Support-Ticket`;
  const preview =
    input.message.length > 280
      ? `${input.message.slice(0, 277)}…`
      : input.message;
  const text = [
    "Guten Tag,",
    "",
    "heute wurde das erste Support-Ticket des Tages erstellt.",
    "",
    `Von: ${input.memberName} (@${input.username})`,
    `Betreff: ${input.subject}`,
    "",
    preview,
    "",
    `Tickets öffnen: ${ticketsUrl}`,
    "",
    "Weitere Tickets am selben Tag lösen keine zusätzliche E-Mail aus.",
    "",
    club,
  ].join("\n");
  const href = ticketsUrl.replace(/&/g, "&amp;");
  const html = [
    "<p>Guten Tag,</p>",
    "<p>heute wurde das <strong>erste Support-Ticket des Tages</strong> erstellt.</p>",
    `<p><strong>Von:</strong> ${escapeHtml(input.memberName)} (@${escapeHtml(input.username)})<br/>`,
    `<strong>Betreff:</strong> ${escapeHtml(input.subject)}</p>`,
    `<p>${escapeHtml(preview).replace(/\n/g, "<br/>")}</p>`,
    `<p><a href="${href}">Tickets im Admin öffnen</a></p>`,
    "<p>Weitere Tickets am selben Tag lösen keine zusätzliche E-Mail aus.</p>",
    `<p>${club}</p>`,
  ].join("");

  const result = await sendMail({
    to: notifyTo,
    subject,
    text,
    html,
  });
  if (!result.sent) {
    console.error(
      "Ticket-Benachrichtigung",
      "message" in result ? result.message : "",
    );
    if (markerAvailable) await releaseDailyTicketNotifySlot(dayKey);
    return;
  }

  console.info(
    "Ticket-Benachrichtigung gesendet an",
    notifyTo,
    dayKey,
    input.ticketId,
  );
}

export type SupportTicketState =
  | { error: string; fields?: { subject: string; message: string } }
  | { success: true }
  | null;

export async function createSupportTicketAction(
  _prev: SupportTicketState,
  formData: FormData,
): Promise<SupportTicketState> {
  const fields = {
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
  };

  const user = await getCurrentUser();
  if (!user) {
    return {
      error: "Bitte melden Sie sich an, um ein Problem zu melden.",
      fields,
    };
  }

  const parsed = ticketSchema.safeParse(fields);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
      fields,
    };
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      clubId: await requireCurrentClubId(),
      subject: parsed.data.subject,
      message: parsed.data.message,
      userId: user.id,
    },
  });

  try {
    await notifyFirstSupportTicketOfDay({
      ticketId: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      memberName: user.name,
      username: user.username,
      createdAt: ticket.createdAt,
    });
  } catch (error) {
    console.error("Ticket-Benachrichtigung", error);
  }

  return { success: true };
}

const statusSchema = z.enum(["OPEN", "CLOSED"]);

export type UpdateSupportTicketStatusState =
  | { error: string }
  | { ok: true }
  | null;

async function notifyTicketClosed(input: {
  to: string;
  memberName: string;
  subject: string;
  message: string;
}) {
  if (!(await isMailConfigured())) {
    console.warn("Ticket-Schließung: E-Mail nicht konfiguriert.");
    return;
  }
  if (!isSendableEmail(input.to)) {
    console.warn(
      "Ticket-Schließung: ungültige oder Demo-Empfängeradresse.",
      input.to,
    );
    return;
  }

  const club = await clubDisplayName();
  const subject = `${club} – Ihr Ticket wurde geschlossen: ${input.subject}`;
  const text = [
    `Guten Tag ${input.memberName},`,
    "",
    "Ihr Support-Ticket wurde geschlossen.",
    "",
    `Betreff: ${input.subject}`,
    "",
    input.message,
    "",
    "Falls Sie dazu noch Fragen haben, können Sie jederzeit ein neues Ticket erstellen.",
    "",
    "Mit freundlichen Grüßen",
    club,
  ].join("\n");
  const html = [
    `<p>Guten Tag ${escapeHtml(input.memberName)},</p>`,
    "<p>Ihr Support-Ticket wurde geschlossen.</p>",
    `<p><strong>Betreff:</strong> ${escapeHtml(input.subject)}</p>`,
    `<p style="color:#666;font-size:13px;">${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>`,
    "<p>Falls Sie dazu noch Fragen haben, können Sie jederzeit ein neues Ticket erstellen.</p>",
    `<p>Mit freundlichen Grüßen<br/>${club}</p>`,
  ].join("");

  const result = await sendMail({
    to: input.to,
    subject,
    text,
    html,
  });
  if (!result.sent) {
    console.error(
      "Ticket-Schließungs-Benachrichtigung",
      "message" in result ? result.message : "",
    );
    return;
  }

  console.info("Ticket-Schließungs-Benachrichtigung gesendet an", input.to);
}

export async function updateSupportTicketStatusAction(
  _prev: UpdateSupportTicketStatusState,
  formData: FormData,
): Promise<UpdateSupportTicketStatusState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { error: "Keine Berechtigung." };
  }

  const ticketId = String(formData.get("ticketId") ?? "");
  const statusParsed = statusSchema.safeParse(formData.get("status"));
  if (!ticketId || !statusParsed.success) {
    return { error: "Ungültige Angaben." };
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { name: true, email: true } },
    },
  });
  if (!ticket) {
    return { error: "Ticket nicht gefunden." };
  }

  const nextStatus = statusParsed.data;
  if (ticket.status === nextStatus) {
    return { ok: true };
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data:
      nextStatus === "CLOSED"
        ? {
            status: "CLOSED",
            closedAt: new Date(),
            closedById: admin.id,
          }
        : {
            status: "OPEN",
            closedAt: null,
            closedById: null,
          },
  });

  if (nextStatus === "CLOSED") {
    try {
      await notifyTicketClosed({
        to: ticket.user.email,
        memberName: ticket.user.name,
        subject: ticket.subject,
        message: ticket.message,
      });
    } catch (error) {
      console.error("Ticket-Schließungs-Benachrichtigung", error);
    }
  }

  revalidatePath("/admin/tickets");
  return { ok: true };
}

const forwardSchema = z.object({
  ticketId: z.string().min(1),
  note: z
    .string()
    .trim()
    .max(2000, { error: "Der Hinweis darf höchstens 2000 Zeichen haben." }),
});

export type ForwardSupportTicketState =
  | { error: string }
  | { ok: true }
  | null;

async function notifyPlatformOfForwardedTicket(input: {
  clubName: string;
  adminName: string;
  memberName: string;
  memberEmail: string;
  subject: string;
  message: string;
  note: string;
}) {
  const recipients = (
    await prisma.platformAdmin.findMany({ select: { email: true } })
  )
    .map((admin) => admin.email)
    .filter((email) => isSendableEmail(email));
  if (recipients.length === 0 || !(await isMailConfigured())) return;

  const ticketsUrl = `${await platformBaseUrl()}/vereine/tickets`;
  const subject = `wegaPlan – Ticket von ${input.clubName}: ${input.subject}`;
  const noteBlock = input.note
    ? ["", "Hinweis des Vereins:", input.note]
    : [];
  const text = [
    "Guten Tag,",
    "",
    "ein Verein hat ein Support-Ticket an wegaPlan weitergeleitet.",
    "",
    `Verein: ${input.clubName}`,
    `Weitergeleitet von: ${input.adminName}`,
    `Mitglied: ${input.memberName} (${input.memberEmail})`,
    `Betreff: ${input.subject}`,
    "",
    input.message,
    ...noteBlock,
    "",
    `Tickets öffnen: ${ticketsUrl}`,
  ].join("\n");
  const href = ticketsUrl.replace(/&/g, "&amp;");
  const html = [
    "<p>Guten Tag,</p>",
    "<p>ein Verein hat ein Support-Ticket an wegaPlan weitergeleitet.</p>",
    `<p><strong>Verein:</strong> ${escapeHtml(input.clubName)}<br/>`,
    `<strong>Weitergeleitet von:</strong> ${escapeHtml(input.adminName)}<br/>`,
    `<strong>Mitglied:</strong> ${escapeHtml(input.memberName)} (${escapeHtml(input.memberEmail)})<br/>`,
    `<strong>Betreff:</strong> ${escapeHtml(input.subject)}</p>`,
    `<p>${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>`,
    input.note
      ? `<p><strong>Hinweis des Vereins:</strong><br/>${escapeHtml(input.note).replace(/\n/g, "<br/>")}</p>`
      : "",
    `<p><a href="${href}">Weitergeleitete Tickets öffnen</a></p>`,
  ].join("");

  for (const to of recipients) {
    const result = await sendMail({ to, subject, text, html });
    if (!result.sent) {
      console.error(
        "Ticket-Weiterleitung",
        to,
        "message" in result ? result.message : "",
      );
    }
  }
}

export async function forwardSupportTicketAction(
  _prev: ForwardSupportTicketState,
  formData: FormData,
): Promise<ForwardSupportTicketState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { error: "Keine Berechtigung." };
  }

  const parsed = forwardSchema.safeParse({
    ticketId: String(formData.get("ticketId") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
    };
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parsed.data.ticketId },
    include: {
      user: { select: { name: true, email: true } },
      club: { select: { name: true } },
    },
  });
  if (!ticket) {
    return { error: "Ticket nicht gefunden." };
  }

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      forwardedAt: new Date(),
      forwardedById: admin.id,
      forwardNote: parsed.data.note,
      platformStatus: "OPEN",
      platformClosedAt: null,
    },
  });

  try {
    await notifyPlatformOfForwardedTicket({
      clubName: ticket.club.name,
      adminName: admin.name,
      memberName: ticket.user.name,
      memberEmail: ticket.user.email,
      subject: ticket.subject,
      message: ticket.message,
      note: parsed.data.note,
    });
  } catch (error) {
    console.error("Ticket-Weiterleitung", error);
  }

  revalidatePath("/admin/tickets");
  revalidatePath("/vereine/tickets");
  return { ok: true };
}

const replySchema = z.object({
  ticketId: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(5, { error: "Bitte mindestens 5 Zeichen antworten." })
    .max(5000),
});

export type ReplySupportTicketState =
  | { error: string }
  | { ok: true }
  | null;

export async function replySupportTicketAction(
  _prev: ReplySupportTicketState,
  formData: FormData,
): Promise<ReplySupportTicketState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { error: "Keine Berechtigung." };
  }

  const parsed = replySchema.safeParse({
    ticketId: String(formData.get("ticketId") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Ungültige Angaben.",
    };
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parsed.data.ticketId },
    include: {
      user: { select: { name: true, email: true } },
    },
  });
  if (!ticket) {
    return { error: "Ticket nicht gefunden." };
  }

  if (!(await isMailConfigured())) {
    return { error: "E-Mail-Versand ist nicht konfiguriert." };
  }

  if (!isSendableEmail(ticket.user.email)) {
    return {
      error:
        "Die E-Mail-Adresse des Mitglieds ist ungültig oder eine Demo-Adresse.",
    };
  }

  const replyBody = parsed.data.body;
  const club = await clubDisplayName();
  const subject = `${club} – Antwort auf Ihr Ticket: ${ticket.subject}`;
  const text = [
    `Guten Tag ${ticket.user.name},`,
    "",
    replyBody,
    "",
    "—",
    `Ihr ursprüngliches Ticket: ${ticket.subject}`,
    ticket.message,
    "",
    "Mit freundlichen Grüßen",
    `${admin.name} – ${club}`,
  ].join("\n");
  const html = [
    `<p>Guten Tag ${escapeHtml(ticket.user.name)},</p>`,
    `<p>${escapeHtml(replyBody).replace(/\n/g, "<br/>")}</p>`,
    "<hr/>",
    `<p style="color:#666;font-size:13px;"><strong>Ihr ursprüngliches Ticket:</strong> ${escapeHtml(ticket.subject)}<br/>`,
    `${escapeHtml(ticket.message).replace(/\n/g, "<br/>")}</p>`,
    `<p>Mit freundlichen Grüßen<br/>${escapeHtml(admin.name)} – ${escapeHtml(club)}</p>`,
  ].join("");

  const result = await sendMail({
    to: ticket.user.email,
    subject,
    text,
    html,
  });
  if (!result.sent) {
    return { error: result.message };
  }

  return { ok: true };
}
