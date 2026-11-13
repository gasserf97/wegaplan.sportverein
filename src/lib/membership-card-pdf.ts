import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { ASC_LAJEN } from "@/lib/brand";
import { formatBirthDate } from "@/lib/format";
import { validityLabel, type MembershipCardData } from "@/lib/membership-card-data";
import { winAnsi } from "@/lib/payment-confirmation-pdf";
import { readPublicAsset } from "@/lib/public-asset";

/** Entspricht der App-Karte (max. 380px). */
const CARD_WIDTH = 380;
const CARD_HEIGHT = 236;

function hexRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const u = Math.min(1, Math.max(0, t));
  return rgb(
    a.red + (b.red - a.red) * u,
    a.green + (b.green - a.green) * u,
    a.blue + (b.blue - a.blue) * u,
  );
}

/** Wie in der App: linear-gradient(160deg, red 0%, navy 55%, green 100%). */
function gradientColor(t: number): RGB {
  const red = hexRgb(ASC_LAJEN.red);
  const navy = hexRgb(ASC_LAJEN.navy);
  const green = hexRgb(ASC_LAJEN.green);
  if (t <= 0.55) return mixRgb(red, navy, t / 0.55);
  return mixRgb(navy, green, (t - 0.55) / 0.45);
}

/** Gefülltes Round-Rect über Rechtecke + Kreise (SVG-Pfad füllt in pdf-lib oft nicht). */
function drawRoundedRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: RGB,
) {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0) {
    page.drawRectangle({ x, y, width: w, height: h, color });
    return;
  }
  page.drawRectangle({
    x: x + rr,
    y,
    width: Math.max(0, w - 2 * rr),
    height: h,
    color,
  });
  page.drawRectangle({
    x,
    y: y + rr,
    width: w,
    height: Math.max(0, h - 2 * rr),
    color,
  });
  const corners = [
    { cx: x + rr, cy: y + rr },
    { cx: x + w - rr, cy: y + rr },
    { cx: x + rr, cy: y + h - rr },
    { cx: x + w - rr, cy: y + h - rr },
  ];
  for (const corner of corners) {
    page.drawCircle({ x: corner.cx, y: corner.cy, size: rr, color });
  }
}

function cardTitleLines(
  title: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const text = winAnsi(title);
  const yearMatch = text.match(/^(.*?)(\s+)(\d{4})$/);
  if (yearMatch) {
    const head = yearMatch[1].trim();
    const year = yearMatch[3];
    return head ? [head, year] : [year];
  }
  return wrapText(title, font, size, maxWidth).slice(0, 2);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = winAnsi(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

async function drawCard(
  page: PDFPage,
  pdf: PDFDocument,
  data: MembershipCardData,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const white = rgb(1, 1, 1);
  const navy = hexRgb(ASC_LAJEN.navy);
  const green = hexRgb(ASC_LAJEN.green);
  const grey = rgb(0.4, 0.4, 0.4);
  const dark = hexRgb(ASC_LAJEN.dark);

  const strip = 1.2;
  for (let y = 0; y < CARD_HEIGHT; y += strip) {
    const fromTop = 1 - (y + strip / 2) / CARD_HEIGHT;
    page.drawRectangle({
      x: 0,
      y,
      width: CARD_WIDTH,
      height: Math.min(strip, CARD_HEIGHT - y),
      color: gradientColor(fromTop),
    });
  }

  const pad = 20;
  const logoBox = 42;
  const logoInner = 34;
  const logoX = CARD_WIDTH - pad - logoBox;
  const logoY = CARD_HEIGHT - pad - logoBox;
  drawRoundedRect(page, logoX, logoY, logoBox, logoBox, 6, white);

  const logoBytes = await readPublicAsset("asc-logo-icon.png");
  if (logoBytes) {
    try {
      const image = await pdf.embedPng(logoBytes);
      const inset = (logoBox - logoInner) / 2;
      page.drawImage(image, {
        x: logoX + inset,
        y: logoY + inset,
        width: logoInner,
        height: logoInner,
      });
    } catch {
      // ohne Logo weiterzeichnen
    }
  }

  const headerMaxWidth = logoX - pad - 10;
  page.drawText(winAnsi("ASC LAJEN RAIFFEISEN"), {
    x: pad,
    y: CARD_HEIGHT - 32,
    size: 8,
    font: fonts.bold,
    color: white,
  });

  const titleSize = 18;
  const titleLines = cardTitleLines(
    data.cardTitle,
    fonts.bold,
    titleSize,
    headerMaxWidth,
  );
  let titleY = CARD_HEIGHT - 56;
  for (const line of titleLines) {
    page.drawText(line, {
      x: pad,
      y: titleY,
      size: titleSize,
      font: fonts.bold,
      color: white,
    });
    titleY -= 21;
  }

  const innerX = 12;
  const innerY = 12;
  const innerW = CARD_WIDTH - 24;
  const innerH = Math.max(118, titleY - 18 - innerY);
  drawRoundedRect(page, innerX, innerY, innerW, innerH, 12, white);

  const textX = innerX + 18;
  const textWidth = innerW - 36;
  let y = innerY + innerH - 28;

  const nameLines = wrapText(data.name, fonts.bold, 16, textWidth).slice(0, 2);
  for (const line of nameLines) {
    page.drawText(line, {
      x: textX,
      y,
      size: 16,
      font: fonts.bold,
      color: navy,
    });
    y -= 18;
  }

  page.drawText(
    winAnsi(`Nr. ${data.memberNo} · geb. ${formatBirthDate(data.birthDate)}`),
    { x: textX, y, size: 10, font: fonts.regular, color: grey },
  );
  y -= 22;

  const planLines = wrapText(data.planTitle, fonts.bold, 11, textWidth).slice(0, 2);
  for (const line of planLines) {
    page.drawText(line, {
      x: textX,
      y,
      size: 11,
      font: fonts.bold,
      color: green,
    });
    y -= 14;
  }

  const validity = validityLabel(
    data.periodStart,
    data.periodEnd,
    data.interval,
  ).replace(/^gültig/, "Gültig");
  page.drawText(winAnsi(validity), {
    x: textX,
    y: Math.max(innerY + 16, y),
    size: 10,
    font: fonts.bold,
    color: dark,
  });
}

export async function buildMembershipCardPdf(data: MembershipCardData) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.cardTitle} – ${data.name}`);
  pdf.setAuthor("ASC Lajen Raiffeisen");
  pdf.setCreator("ASC Lajen Raiffeisen");
  pdf.setLanguage("de-IT");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([CARD_WIDTH, CARD_HEIGHT]);
  await drawCard(page, pdf, data, { regular, bold });

  return Buffer.from(await pdf.save());
}

export function membershipCardPdfFilename(name: string) {
  const slug = name
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `Mitgliedskarte${slug ? `-${slug}` : ""}.pdf`;
}
