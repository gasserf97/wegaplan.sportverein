"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isMailConfigured, isSendableEmail, sendMail } from "@/lib/mail";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { clubPublicUrl, requestHostHeader, runWithClub } from "@/lib/tenant";

export async function setPlatformTicketStatusAction(formData: FormData) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");

  const ticketId = String(formData.get("ticketId") ?? "");
  const status = formData.get("status") === "CLOSED" ? "CLOSED" : "OPEN";
  if (!ticketId) redirect("/vereine/tickets");

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { forwardedAt: true },
  });
  if (!ticket?.forwardedAt) redirect("/vereine/tickets");

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data:
      status === "CLOSED"
        ? { platformStatus: "CLOSED", platformClosedAt: new Date() }
        : { platformStatus: "OPEN", platformClosedAt: null },
  });

  revalidatePath("/vereine/tickets");
  revalidatePath("/admin/tickets");
  redirect("/vereine/tickets");
}

const replySchema = z.object({
  ticketId: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(5, { error: "Bitte mindestens 5 Zeichen antworten." })
    .max(5000),
});

export type ReplyPlatformTicketState =
  | { error: string }
  | { ok: true }
  | null;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function emailClubAdmins(input: {
  clubId: string;
  clubName: string;
  clubSlug: string;
  subject: string;
  body: string;
  authorName: string;
}) {
  const host = await requestHostHeader().catch(() => "");
  const ticketsUrl = `${clubPublicUrl(input.clubSlug, host)}/admin/tickets`;
  const subject = `wegaPlan – Antwort zu Ihrem Ticket: ${input.subject}`;
  const text = [
    "Guten Tag,",
    "",
    `${input.authorName} von wegaPlan hat auf ein weitergeleitetes Ticket geantwortet.`,
    "",
    `Verein: ${input.clubName}`,
    `Betreff: ${input.subject}`,
    "",
    input.body,
    "",
    `Tickets öffnen: ${ticketsUrl}`,
  ].join("\n");
  const href = ticketsUrl.replace(/&/g, "&amp;");
  const html = [
    "<p>Guten Tag,</p>",
    `<p>${escapeHtml(input.authorName)} von wegaPlan hat auf ein weitergeleitetes Ticket geantwortet.</p>`,
    `<p><strong>Verein:</strong> ${escapeHtml(input.clubName)}<br/>`,
    `<strong>Betreff:</strong> ${escapeHtml(input.subject)}</p>`,
    `<p>${escapeHtml(input.body).replace(/\n/g, "<br/>")}</p>`,
    `<p><a href="${href}">Tickets im Verein öffnen</a></p>`,
  ].join("");

  await runWithClub(input.clubId, async () => {
    if (!(await isMailConfigured())) return;
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", canLogin: true },
      select: { email: true },
    });
    const seen = new Set<string>();
    for (const admin of admins) {
      const to = admin.email.trim().toLowerCase();
      if (!isSendableEmail(to) || seen.has(to)) continue;
      seen.add(to);
      const result = await sendMail({ to, subject, text, html });
      if (!result.sent) {
        console.error(
          "Ticket-Antwort an den Verein",
          to,
          "message" in result ? result.message : "",
        );
      }
    }
  });
}

export async function replyPlatformTicketAction(
  _prev: ReplyPlatformTicketState,
  formData: FormData,
): Promise<ReplyPlatformTicketState> {
  const admin = await getPlatformAdmin();
  if (!admin) return { error: "Keine Berechtigung." };

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
    select: {
      id: true,
      subject: true,
      forwardedAt: true,
      clubId: true,
      club: { select: { name: true, slug: true } },
    },
  });
  if (!ticket?.forwardedAt) return { error: "Ticket nicht gefunden." };

  await prisma.supportTicketPlatformReply.create({
    data: {
      ticketId: ticket.id,
      body: parsed.data.body,
      authorName: admin.name,
    },
  });

  try {
    await emailClubAdmins({
      clubId: ticket.clubId,
      clubName: ticket.club.name,
      clubSlug: ticket.club.slug,
      subject: ticket.subject,
      body: parsed.data.body,
      authorName: admin.name,
    });
  } catch (error) {
    console.error("Ticket-Antwort an den Verein", error);
  }

  revalidatePath("/vereine/tickets");
  revalidatePath("/admin/tickets");
  return { ok: true };
}
