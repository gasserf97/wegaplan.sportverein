import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { ASC_CLUB, ASC_LAJEN } from "@/lib/brand";
import type { Locale } from "@/lib/i18n/types";
import { readPublicAsset } from "@/lib/public-asset";

export type CourtReceiptPdfInput = {
  receiptNumber: number;
  recipientName: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  amountCents: number;
  paidAt: Date;
  /** Localized payment method label */
  paymentMethod: string;
  locale?: Locale;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

function formatDate(date: Date, locale: Locale) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return locale === "it"
    ? `${day}/${month}/${year}`
    : `${day}.${month}.${year}`;
}

function formatEuro(cents: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "it" ? "it-IT" : "de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatReceiptNumber(n: number) {
  return String(n).padStart(6, "0");
}

/** Standard-PDF-Fonts (WinAnsi) – Zeichen außerhalb Latin-1 ersetzen. */
function winAnsi(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/€/g, "EUR")
    .replace(/[^\x00-\xff]/g, "?");
}

function formatDuration(hours: number, locale: Locale) {
  const rounded = Math.round(hours * 100) / 100;
  if (locale === "it") {
    if (rounded === 1) return "1 ora";
    const label = Number.isInteger(rounded)
      ? String(rounded)
      : String(rounded).replace(".", ",");
    return `${label} ore`;
  }
  if (rounded === 1) return "1 Stunde";
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(".", ",");
  return `${label} Stunden`;
}

/** "Platz 2" / "Campo 2" → localized usage line */
export function courtUsageDescription(courtName: string, locale: Locale = "de") {
  const match = courtName.trim().match(/(\d+)\s*$/);
  if (locale === "it") {
    if (match) return `Utilizzo campo da tennis n. ${match[1]}`;
    return `Utilizzo campo da tennis: ${courtName.trim()}`;
  }
  if (match) return `Nutzung Tennisplatz Nr. ${match[1]}`;
  return `Nutzung Tennisplatz: ${courtName.trim()}`;
}

export function courtReceiptPdfFilename(
  receiptNumber: number,
  locale: Locale = "de",
) {
  const prefix = locale === "it" ? "Ricevuta" : "Quittung";
  return `${prefix}-${formatReceiptNumber(receiptNumber)}.pdf`;
}

export function formatCourtReceiptNumber(receiptNumber: number) {
  return formatReceiptNumber(receiptNumber);
}

async function embedPngOrJpg(
  pdf: PDFDocument,
  filename: "asc-logo-icon.png",
) {
  const bytes = await readPublicAsset(filename);
  if (!bytes) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

function drawCentered(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  color = rgb(0.08, 0.08, 0.08),
) {
  const line = winAnsi(text);
  const width = font.widthOfTextAtSize(line, size);
  page.drawText(line, {
    x: (PAGE_WIDTH - width) / 2,
    y,
    size,
    font,
    color,
  });
}

function drawLeftRight(
  page: ReturnType<PDFDocument["addPage"]>,
  left: string,
  right: string,
  font: PDFFont,
  size: number,
  y: number,
  color = rgb(0.08, 0.08, 0.08),
) {
  page.drawText(winAnsi(left), {
    x: MARGIN,
    y,
    size,
    font,
    color,
  });
  const rightLine = winAnsi(right);
  const rightWidth = font.widthOfTextAtSize(rightLine, size);
  page.drawText(rightLine, {
    x: PAGE_WIDTH - MARGIN - rightWidth,
    y,
    size,
    font,
    color,
  });
}

function copyFor(locale: Locale) {
  if (locale === "it") {
    return {
      title: (no: string) => `Ricevuta N. ${no}`,
      subject: "Ricevuta utilizzo campo da tennis",
      language: "it-IT",
      legalForm: "ASSOCIAZIONE SPORTIVA DILETTANTISTICA",
      receiptHeading: (no: string) => `RICEVUTA N. ${no}`,
      dateLabel: "Data",
      receivedFrom: "Ricevuto da",
      forLabel: "per:",
      duration: "Durata",
      amount: "Corrispettivo",
      total: "TOTALE",
      payment: "Pagamento",
      taxRegime: "Regime fiscale ex Legge 398/1991",
    };
  }
  return {
    title: (no: string) => `Quittung Nr. ${no}`,
    subject: "Quittung Nutzung Tennisplatz",
    language: "de-IT",
    legalForm: "AMATEUR-SPORTVEREIN",
    receiptHeading: (no: string) => `QUITTUNG NR. ${no}`,
    dateLabel: "Datum",
    receivedFrom: "Erhalten von",
    forLabel: "für:",
    duration: "Dauer",
    amount: "Betrag",
    total: "GESAMT",
    payment: "Zahlung",
    taxRegime: "Steuerregelung gemäß Legge 398/1991",
  };
}

export async function buildCourtPaymentReceiptPdf(input: CourtReceiptPdfInput) {
  const locale: Locale = input.locale === "it" ? "it" : "de";
  const labels = copyFor(locale);
  const amount = formatEuro(input.amountCents, locale);
  const receiptNo = formatReceiptNumber(input.receiptNumber);
  const paidDate = formatDate(input.paidAt, locale);
  const playDate = formatDate(input.startsAt, locale);
  const hours =
    (input.endsAt.getTime() - input.startsAt.getTime()) / 3_600_000;
  const duration = formatDuration(hours, locale);
  const usage = courtUsageDescription(input.courtName, locale);

  const pdf = await PDFDocument.create();
  pdf.setTitle(labels.title(receiptNo));
  pdf.setAuthor(ASC_CLUB.name);
  pdf.setSubject(labels.subject);
  pdf.setCreator(ASC_CLUB.name);
  pdf.setProducer(ASC_CLUB.name);
  pdf.setLanguage(labels.language);
  pdf.setCreationDate(input.paidAt);
  pdf.setModificationDate(new Date());

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = hexRgb(ASC_LAJEN.dark);
  const muted = rgb(0.35, 0.35, 0.35);

  let y = PAGE_HEIGHT - MARGIN - 8;

  const logo = await embedPngOrJpg(pdf, "asc-logo-icon.png");
  if (logo) {
    const size = 56;
    page.drawImage(logo, {
      x: (PAGE_WIDTH - size) / 2,
      y: y - size,
      width: size,
      height: size,
    });
    y -= size + 12;
  }

  drawCentered(page, labels.legalForm, bold, 11, y, dark);
  y -= 16;
  drawCentered(page, ASC_CLUB.tennisClubName, bold, 13, y, dark);
  y -= 18;
  drawCentered(page, ASC_CLUB.street, regular, 10, y, dark);
  y -= 14;
  drawCentered(
    page,
    `${ASC_CLUB.postalCode} ${ASC_CLUB.city} (${ASC_CLUB.province})`,
    regular,
    10,
    y,
    dark,
  );
  y -= 14;
  drawCentered(page, `C.F. ${ASC_CLUB.taxId}`, regular, 10, y, dark);
  y -= 14;
  drawCentered(page, `P. IVA ${ASC_CLUB.vatId}`, regular, 10, y, dark);
  y -= 22;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: dark,
  });
  y -= 28;

  page.drawText(winAnsi(labels.receiptHeading(receiptNo)), {
    x: MARGIN,
    y,
    size: 14,
    font: bold,
    color: dark,
  });
  y -= 18;
  page.drawText(winAnsi(`${labels.dateLabel}: ${paidDate}`), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: dark,
  });
  y -= 28;

  page.drawText(winAnsi(`${labels.receivedFrom}: ${input.recipientName}`), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: dark,
  });
  y -= 26;

  page.drawText(winAnsi(labels.forLabel), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: muted,
  });
  y -= 16;
  page.drawText(winAnsi(usage), {
    x: MARGIN,
    y,
    size: 11,
    font: bold,
    color: dark,
  });
  y -= 16;
  page.drawText(winAnsi(`${labels.duration}: ${duration}`), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: dark,
  });
  y -= 16;
  page.drawText(winAnsi(`${labels.dateLabel}: ${playDate}`), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: dark,
  });
  y -= 32;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 22;

  drawLeftRight(
    page,
    labels.amount,
    `EUR ${amount}`,
    regular,
    11,
    y,
    dark,
  );
  y -= 24;
  drawLeftRight(page, labels.total, `EUR ${amount}`, bold, 12, y, dark);
  y -= 28;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 22;

  page.drawText(winAnsi(`${labels.payment}: ${input.paymentMethod}`), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: dark,
  });
  y -= 36;

  page.drawText(winAnsi(labels.taxRegime), {
    x: MARGIN,
    y,
    size: 10,
    font: regular,
    color: muted,
  });

  return Buffer.from(await pdf.save());
}

function hexRgb(hex: string) {
  const h = hex.replace("#", "");
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}
