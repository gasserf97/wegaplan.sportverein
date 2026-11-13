import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 52;
const RED = rgb(0.894, 0, 0);
const DARK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.38, 0.38, 0.38);

const features = [
  [
    "Mitglieder & Familie",
    "Registrierung und Anmeldung, Pflege der Stammdaten sowie gemeinsame Verwaltung der Familienmitglieder.",
  ],
  [
    "Mitgliedschaft & Abos",
    "Vereinsmitgliedschaft und Zusatzabos (z. B. Tennis) online abschließen und verlängern – inklusive optionaler automatischer Verlängerung. Die Mitgliedskarte wird per E-Mail zugestellt.",
  ],
  [
    "Kurse",
    "Kurse einsehen, anmelden, Warteliste nutzen, Atteste hochladen und bei Bedarf stornieren. Nach erfolgreicher Zahlung wird die Bestätigung automatisch per E-Mail versendet.",
  ],
  [
    "Tennisplätze",
    "Plätze online im Kalender reservieren – mit Preisen und Vorteilen für Mitglieder.",
  ],
  [
    "Fuhrpark",
    "Autos und Geräte tage- oder stundenweise online reservieren.",
  ],
  [
    "Zahlung",
    "Bezahlung per Kreditkarte (Stripe) oder per Überweisung.",
  ],
  [
    "Mein Konto",
    "Buchungen, Abos und Profildaten übersichtlich an einem Ort verwalten.",
  ],
  [
    "Admin & Buchhaltung",
    "Sektionen und Angebote pflegen, Zahlungen prüfen sowie eine detaillierte Übersicht der Einnahmen für die Vereinsverwaltung.",
  ],
  [
    "Mehrsprachig",
    "Die Oberfläche steht auf Deutsch und Italienisch zur Verfügung.",
  ],
];

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const page = pdf.addPage([PAGE_W, PAGE_H]);
const bold = await pdf.embedFont(readFileSync("C:/Windows/Fonts/arialbd.ttf"));
const regular = await pdf.embedFont(readFileSync("C:/Windows/Fonts/arial.ttf"));

let y = PAGE_H - MARGIN;

function draw(text, font, size, color, x = MARGIN) {
  page.drawText(text, { x, y, size, font, color });
}

function wrapDraw(text, font, size, color, x, maxW) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxW) {
      draw(line, font, size, color, x);
      y -= size + 3;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    draw(line, font, size, color, x);
    y -= size + 3;
  }
}

draw("ASC Lajen Raiffeisen", bold, 11, RED);
y -= 22;
draw("Vereinssoftware – Funktionsübersicht", bold, 17, DARK);
y -= 15;
draw(
  "Kurzüberblick der wichtigsten Funktionen für Mitglieder und Vereinsverwaltung.",
  regular,
  10,
  MUTED,
);
y -= 16;
page.drawLine({
  start: { x: MARGIN, y },
  end: { x: PAGE_W - MARGIN, y },
  thickness: 1.25,
  color: RED,
});
y -= 24;

const maxW = PAGE_W - MARGIN * 2 - 8;
for (const [title, desc] of features) {
  draw(title, bold, 11, DARK);
  y -= 14;
  wrapDraw(desc, regular, 10, MUTED, MARGIN + 6, maxW);
  y -= 10;
}

page.drawLine({
  start: { x: MARGIN, y: 56 },
  end: { x: PAGE_W - MARGIN, y: 56 },
  thickness: 0.5,
  color: rgb(0.78, 0.78, 0.78),
});
page.drawText("asclajen.onrender.com  ·  Stand September 2026", {
  x: MARGIN,
  y: 40,
  size: 8,
  font: regular,
  color: MUTED,
});

mkdirSync("docs", { recursive: true });
const out = "docs/Vereinssoftware-Funktionsuebersicht.pdf";
writeFileSync(out, await pdf.save());
console.log(`Wrote ${out}`);
