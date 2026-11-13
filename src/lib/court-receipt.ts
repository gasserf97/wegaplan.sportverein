import {
  isMailConfigured,
  isSendableEmail,
  mailConfigIssue,
  sendMail,
  type MailAttachment,
} from "@/lib/mail";
import {
  buildCourtPaymentReceiptPdf,
  courtReceiptPdfFilename,
  formatCourtReceiptNumber,
} from "@/lib/court-receipt-pdf";
import { reservationBookerName } from "@/lib/court-booking";
import { getLocale, parseLocale } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/types";
import { prisma } from "@/lib/prisma";

export type CourtReceiptSendResult =
  | {
      sent: true;
      alreadySent?: boolean;
      skipped?: boolean;
      recipients?: string[];
      provider?: string;
      messageIds?: string[];
    }
  | { sent: false; message: string };

async function resolveReceiptLocale(explicit?: Locale): Promise<Locale> {
  if (explicit === "it" || explicit === "de") return explicit;
  try {
    return await getLocale();
  } catch {
    return "de";
  }
}

function resolvePaymentMethod(
  reservation: {
    priceCents: number;
    creditAppliedCents: number;
    stripeSessionId: string | null;
  },
  locale: Locale,
) {
  const cardCents = Math.max(
    0,
    reservation.priceCents - reservation.creditAppliedCents,
  );
  const card = locale === "it" ? "Carta di credito" : "Kreditkarte";
  const credit = locale === "it" ? "credito associativo" : "Vereinsguthaben";
  const cash = locale === "it" ? "contanti" : "Bar";

  if (cardCents <= 0 && reservation.creditAppliedCents > 0) {
    return credit;
  }
  if (cardCents > 0 && reservation.creditAppliedCents > 0) {
    return `${card} / ${credit}`;
  }
  if (reservation.stripeSessionId || cardCents > 0) {
    return card;
  }
  return `${cash} / ${card}`;
}

function buildReceiptMailCopy(input: {
  recipientName: string;
  receiptNumber: number;
  courtName: string;
  locale: Locale;
}) {
  const no = formatCourtReceiptNumber(input.receiptNumber);
  if (input.locale === "it") {
    const subject = `Ricevuta N. ${no} – Campo da tennis ${input.courtName}`;
    const text = [
      `Ciao ${input.recipientName},`,
      "",
      `in allegato trovi la ricevuta N. ${no} per la tua prenotazione del campo da tennis (${input.courtName}).`,
      "",
      "Cordiali saluti",
      "ASC Lajen Raiffeisen – Sezione Tennis",
    ].join("\n");
    const html = `
    <p>Ciao ${escapeHtml(input.recipientName)},</p>
    <p>in allegato trovi la <strong>ricevuta N. ${no}</strong> per la tua prenotazione del campo da tennis (${escapeHtml(input.courtName)}).</p>
    <p>Cordiali saluti<br/>ASC Lajen Raiffeisen – Sezione Tennis</p>
  `.trim();
    return { subject, text, html };
  }

  const subject = `Quittung Nr. ${no} – Tennisplatz ${input.courtName}`;
  const text = [
    `Hallo ${input.recipientName},`,
    "",
    `im Anhang finden Sie die Quittung Nr. ${no} für Ihre Tennisplatz-Reservierung (${input.courtName}).`,
    "",
    "Freundliche Grüße",
    "ASC Lajen Raiffeisen – Sektion Tennis",
  ].join("\n");
  const html = `
    <p>Hallo ${escapeHtml(input.recipientName)},</p>
    <p>im Anhang finden Sie die <strong>Quittung Nr. ${no}</strong> für Ihre Tennisplatz-Reservierung (${escapeHtml(input.courtName)}).</p>
    <p>Freundliche Grüße<br/>ASC Lajen Raiffeisen – Sektion Tennis</p>
  `.trim();
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function allocateReceiptNumber(reservationId: string): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.courtReservation.findUnique({
          where: { id: reservationId },
          select: { receiptNumber: true },
        });
        if (current?.receiptNumber != null) {
          return current.receiptNumber;
        }
        const agg = await tx.courtReservation.aggregate({
          _max: { receiptNumber: true },
        });
        const next = (agg._max.receiptNumber ?? 0) + 1;
        await tx.courtReservation.update({
          where: { id: reservationId },
          data: { receiptNumber: next },
        });
        return next;
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Receipt-Nummer konnte nicht vergeben werden (Konflikt).");
}

/**
 * Sends the tennis court receipt PDF after a paid reservation.
 * Language follows the user's site locale (default German).
 */
export async function sendCourtReservationReceipt(
  reservationId: string,
  options?: { force?: boolean; locale?: Locale | string },
): Promise<CourtReceiptSendResult> {
  const reservation = await prisma.courtReservation.findUnique({
    where: { id: reservationId },
    include: {
      court: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
  });

  if (!reservation || reservation.status !== "CONFIRMED") {
    return { sent: false, message: "Keine bestätigte Platzreservierung gefunden." };
  }
  if (reservation.priceCents <= 0) {
    return { sent: true, skipped: true };
  }

  if (reservation.receiptEmailSentAt && !options?.force) {
    return { sent: true, alreadySent: true };
  }

  const email =
    reservation.user?.email?.trim() ||
    reservation.guestEmail?.trim() ||
    "";
  if (!isSendableEmail(email)) {
    return {
      sent: false,
      message: "Keine gültige Empfänger-E-Mail für die Quittung.",
    };
  }

  if (!isMailConfigured()) {
    const message =
      mailConfigIssue() ?? "E-Mail-Versand ist nicht konfiguriert.";
    console.error("Tennis-Quittung", reservationId, message);
    return { sent: false, message };
  }

  let receiptNumber: number;
  try {
    receiptNumber = await allocateReceiptNumber(reservationId);
  } catch (error) {
    console.error("Tennis-Quittung Nummer", reservationId, error);
    return { sent: false, message: "Receipt-Nummer konnte nicht vergeben werden." };
  }

  const locale = await resolveReceiptLocale(
    typeof options?.locale === "string"
      ? parseLocale(options.locale)
      : options?.locale,
  );
  const recipientName = reservationBookerName(reservation);
  const paymentMethod = resolvePaymentMethod(reservation, locale);
  const paidAt = reservation.paidAt ?? new Date();

  const pdf = await buildCourtPaymentReceiptPdf({
    receiptNumber,
    recipientName,
    courtName: reservation.court.name,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    amountCents: reservation.priceCents,
    paidAt,
    paymentMethod,
    locale,
  });

  const attachments: MailAttachment[] = [
    {
      filename: courtReceiptPdfFilename(receiptNumber, locale),
      content: pdf,
      contentType: "application/pdf",
    },
  ];

  const copy = buildReceiptMailCopy({
    recipientName,
    receiptNumber,
    courtName: reservation.court.name,
    locale,
  });

  try {
    const result = await sendMail({
      to: email,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      attachments,
    });
    if (!result.sent) {
      console.error("Tennis-Quittung", reservationId, result.message);
      return { sent: false, message: result.message };
    }
    await prisma.courtReservation.update({
      where: { id: reservationId },
      data: { receiptEmailSentAt: new Date() },
    });
    return {
      sent: true,
      recipients: [email],
      provider: result.provider,
      messageIds: result.messageId ? [result.messageId] : undefined,
    };
  } catch (error) {
    console.error("Tennis-Quittung", reservationId, error);
    return {
      sent: false,
      message: error instanceof Error ? error.message : "Versand fehlgeschlagen.",
    };
  }
}
