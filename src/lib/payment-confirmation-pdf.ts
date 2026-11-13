import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { ASC_CLUB, ASC_LAJEN } from "@/lib/brand";
import { readPublicAsset } from "@/lib/public-asset";

export type CourseConfirmationLetterInput = {
  memberName: string;
  memberTaxId: string;
  street: string;
  postalCode: string;
  city: string;
  courseTitle: string;
  amountCents: number;
  paidAt: Date;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatLetterDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function formatEuroPlain(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Standard-PDF-Fonts (WinAnsi) – Zeichen außerhalb Latin-1 ersetzen. */
export function winAnsi(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/€/g, "EUR")
    .replace(/[^\x00-\xff]/g, "?");
}

export function confirmationPdfFilename(courseTitle: string, memberName?: string) {
  const slug = courseTitle
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const memberSlug = memberName
    ? memberName
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/Ä/g, "Ae")
        .replace(/Ö/g, "Oe")
        .replace(/Ü/g, "Ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24)
    : "";
  return `Einzahlungsbestaetigung${slug ? `-${slug}` : ""}${memberSlug ? `-${memberSlug}` : ""}.pdf`;
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = winAnsi(text).split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
        while (
          font.widthOfTextAtSize(current, size) > maxWidth &&
          current.length > 1
        ) {
          let cut = current.length - 1;
          while (
            cut > 1 &&
            font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth
          ) {
            cut -= 1;
          }
          lines.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function embedPngOrJpg(
  pdf: PDFDocument,
  filename: "asc-logo-icon.png" | "asc-stamp-signature.jpg",
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

export async function buildCoursePaymentConfirmationPdf(
  input: CourseConfirmationLetterInput,
) {
  const amount = formatEuroPlain(input.amountCents);
  const letterDate = formatLetterDate(input.paidAt);
  const recipientPostal = [input.postalCode, input.city]
    .filter(Boolean)
    .join(" ");

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Einzahlungsbestätigung ${input.courseTitle}`);
  pdf.setAuthor(ASC_CLUB.name);
  pdf.setSubject("Einzahlungsbestätigung");
  pdf.setCreator(ASC_CLUB.name);
  pdf.setProducer(ASC_CLUB.name);
  pdf.setLanguage("de-IT");
  pdf.setCreationDate(input.paidAt);
  pdf.setModificationDate(new Date());

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const red = hexRgb(ASC_LAJEN.red);
  const dark = hexRgb(ASC_LAJEN.dark);
  const muted = rgb(0.33, 0.33, 0.33);

  let y = PAGE_HEIGHT - MARGIN;
  const [logo, stamp] = await Promise.all([
    embedPngOrJpg(pdf, "asc-logo-icon.png"),
    embedPngOrJpg(pdf, "asc-stamp-signature.jpg"),
  ]);
  if (logo) {
    const size = 56;
    page.drawImage(logo, {
      x: (PAGE_WIDTH - size) / 2,
      y: y - size,
      width: size,
      height: size,
    });
    y -= size + 10;
  }

  const drawCentered = (text: string, font: PDFFont, size: number, color = dark) => {
    const line = winAnsi(text);
    const width = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: (PAGE_WIDTH - width) / 2,
      y,
      size,
      font,
      color,
    });
  };

  drawCentered(ASC_CLUB.namePrimary, bold, 16, red);
  y -= 18;
  drawCentered(ASC_CLUB.nameSecondary, bold, 14);
  y -= 20;
  page.drawText(winAnsi(ASC_CLUB.street), {
    x:
      (PAGE_WIDTH - regular.widthOfTextAtSize(winAnsi(ASC_CLUB.street), 10)) /
      2,
    y,
    size: 10,
    font: regular,
    color: dark,
  });
  y -= 13;
  const cityLine = `${ASC_CLUB.postalCode} ${ASC_CLUB.city}`;
  page.drawText(winAnsi(cityLine), {
    x: (PAGE_WIDTH - regular.widthOfTextAtSize(winAnsi(cityLine), 10)) / 2,
    y,
    size: 10,
    font: regular,
    color: dark,
  });
  y -= 13;
  const taxLine = `Steuernummer ${ASC_CLUB.taxId}`;
  page.drawText(winAnsi(taxLine), {
    x: (PAGE_WIDTH - regular.widthOfTextAtSize(winAnsi(taxLine), 10)) / 2,
    y,
    size: 10,
    font: regular,
    color: dark,
  });
  y -= 16;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1.4,
    color: dark,
  });
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: dark,
  });
  y -= 28;

  const addressLines = [
    input.memberName,
    input.street || "",
    recipientPostal,
  ].filter(Boolean);
  for (const line of addressLines) {
    page.drawText(winAnsi(line), {
      x: MARGIN,
      y,
      size: 11,
      font: regular,
      color: dark,
    });
    y -= 15;
  }

  y -= 22;
  drawCentered("EINZAHLUNGSBESTÄTIGUNG", bold, 14);
  y -= 28;

  const body = `Der unterfertigte ${ASC_CLUB.president}, in seiner Eigenschaft als Präsident des ${ASC_CLUB.name}, mit Sitz in ${ASC_CLUB.postalCode} ${ASC_CLUB.city}, bestätigt dass ${input.memberName}, ${input.memberTaxId} an folgendem Programm des ${ASC_CLUB.name} teilgenommen hat:`;
  for (const line of wrapLines(body, regular, 11, CONTENT_WIDTH)) {
    page.drawText(winAnsi(line), {
      x: MARGIN,
      y,
      size: 11,
      font: regular,
      color: dark,
    });
    y -= 16;
  }

  y -= 10;
  for (const line of wrapLines(input.courseTitle, bold, 12, CONTENT_WIDTH)) {
    page.drawText(winAnsi(line), {
      x: MARGIN,
      y,
      size: 12,
      font: bold,
      color: dark,
    });
    y -= 17;
  }

  y -= 8;
  const amountText = `Der Gesamtbetrag von ${amount} Euro wurde ordnungsgemäß überwiesen und ist auf das Konto des ${ASC_CLUB.name} eingegangen.`;
  for (const line of wrapLines(amountText, regular, 11, CONTENT_WIDTH)) {
    page.drawText(winAnsi(line), {
      x: MARGIN,
      y,
      size: 11,
      font: regular,
      color: dark,
    });
    y -= 16;
  }

  y -= 18;
  page.drawText(winAnsi(`${ASC_CLUB.city}, den ${letterDate}`), {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: dark,
  });

  if (stamp) {
    const maxWidth = 176;
    const maxHeight = 132;
    const scale = Math.min(maxWidth / stamp.width, maxHeight / stamp.height);
    const width = stamp.width * scale;
    const height = stamp.height * scale;
    // Links unter „Lajen, den …“
    page.drawImage(stamp, {
      x: MARGIN,
      y: Math.max(y - height - 10, MARGIN + 72),
      width,
      height,
    });
  }

  const footnotes = [
    "Nicht Mehrwertsteuerpflichtig im Sinne des Artikel 4, DPR. Nr. 633/1972.",
    "Nicht Stempelsteuerpflichtig gemäß Tabelle im Anhang des DPR 642/1972, Art 7 letzter A",
  ];
  let footnoteY = MARGIN + 28;
  for (const note of footnotes.reverse()) {
    for (const line of wrapLines(note, regular, 8, CONTENT_WIDTH).reverse()) {
      page.drawText(winAnsi(line), {
        x: MARGIN,
        y: footnoteY,
        size: 8,
        font: regular,
        color: muted,
      });
      footnoteY += 11;
    }
  }

  return Buffer.from(await pdf.save());
}

function hexRgb(hex: string) {
  const value = hex.replace("#", "");
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

export function buildCourseConfirmationMailCopy(input: {
  recipientName: string;
  items: Array<{ memberName: string; courseTitle: string }>;
  context?: "course" | "subscription";
}) {
  const greeting = `Guten Tag ${input.recipientName},`;
  const isSubscription = input.context === "subscription";
  const items = input.items.length > 0 ? input.items : [];

  let introText: string;
  let introHtml: string;
  let attachmentLine: string;

  if (items.length <= 1) {
    const item = items[0] ?? { memberName: input.recipientName, courseTitle: "" };
    const forOther = item.memberName !== input.recipientName;
    if (forOther) {
      introText = isSubscription
        ? `im Anhang finden Sie die Einzahlungsbestätigung für ${item.memberName} zum Angebot "${item.courseTitle}".`
        : `im Anhang finden Sie die Einzahlungsbestätigung für ${item.memberName} zum Kurs "${item.courseTitle}".`;
    } else {
      introText = isSubscription
        ? `vielen Dank für Ihre Buchung des Angebots "${item.courseTitle}" beim ${ASC_CLUB.name}.`
        : `vielen Dank für Ihre Anmeldung zum Kurs "${item.courseTitle}" beim ${ASC_CLUB.name}.`;
    }
    introHtml = escapeHtml(introText);
    attachmentLine =
      "Die Einzahlungsbestätigung liegt dieser E-Mail als PDF-Datei bei.";
  } else {
    const lead = isSubscription
      ? `vielen Dank für Ihre Buchungen beim ${ASC_CLUB.name}. Im Anhang finden Sie die Einzahlungsbestätigungen für:`
      : `vielen Dank für Ihre Anmeldungen beim ${ASC_CLUB.name}. Im Anhang finden Sie die Einzahlungsbestätigungen für:`;
    const listText = items
      .map((item) => `• ${item.memberName}: ${item.courseTitle}`)
      .join("\n");
    introText = `${lead}\n${listText}`;
    introHtml = `${escapeHtml(lead)}<ul style="margin:12px 0 0;padding-left:20px;">${items
      .map(
        (item) =>
          `<li style="margin:0 0 6px;">${escapeHtml(item.memberName)}: ${escapeHtml(item.courseTitle)}</li>`,
      )
      .join("")}</ul>`;
    attachmentLine =
      "Die Einzahlungsbestätigungen liegen dieser E-Mail als PDF-Dateien bei.";
  }

  const text = [
    greeting,
    "",
    introText,
    "",
    attachmentLine,
    "",
    "Mit freundlichen Grüßen",
    ASC_CLUB.name,
    "",
    ASC_CLUB.street,
    `${ASC_CLUB.postalCode} ${ASC_CLUB.city}`,
    `Steuernummer ${ASC_CLUB.taxId}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Einzahlungsbestätigung</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:560px;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222;">
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <div style="margin:0 0 16px;">${introHtml}</div>
    <p style="margin:0 0 16px;">${escapeHtml(attachmentLine)}</p>
    <p style="margin:0 0 24px;">Mit freundlichen Grüßen<br />${escapeHtml(ASC_CLUB.name)}</p>
    <p style="margin:0;font-size:13px;line-height:1.45;color:#555555;">
      ${escapeHtml(ASC_CLUB.name)}<br />
      ${escapeHtml(ASC_CLUB.street)}<br />
      ${escapeHtml(`${ASC_CLUB.postalCode} ${ASC_CLUB.city}`)}<br />
      Steuernummer ${escapeHtml(ASC_CLUB.taxId)}
    </p>
  </div>
</body>
</html>`;

  return { text, html };
}

export function courseConfirmationSubject(
  items: Array<{ memberName: string; courseTitle: string }>,
) {
  const names = [...new Set(items.map((item) => item.memberName))].join(", ");
  const titles = [...new Set(items.map((item) => item.courseTitle))];
  const prefix =
    items.length > 1 ? "Einzahlungsbestätigungen" : "Einzahlungsbestätigung";
  return titles.length === 1
    ? `${prefix} für ${names}: ${titles[0]}`
    : `${prefix} für ${names}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
