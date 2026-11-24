import { inflateRawSync } from "node:zlib";

export type XlsxGrid = {
  sheetName: string;
  rows: string[][];
};

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnIndex(cellRef: string) {
  const letters = /^[A-Z]+/i.exec(cellRef)?.[0] ?? "A";
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** Local ZIP entries. Excel files from this app and from Excel itself use method 0 or 8. */
export function unzipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    if (flags & 0x08) {
      throw new Error(
        "Diese Excel-Datei kann nicht gelesen werden. Bitte in Excel erneut als .xlsx speichern.",
      );
    }
    if (dataStart + compressedSize > buffer.length) {
      throw new Error("Die Excel-Datei ist unvollständig.");
    }
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data =
      method === 0
        ? Buffer.from(compressed)
        : method === 8
          ? inflateRawSync(compressed)
          : null;
    if (!data) {
      throw new Error("Diese Excel-Kompression wird nicht unterstützt.");
    }
    entries.set(name.replace(/\\/g, "/"), data);
    offset = dataStart + compressedSize;
  }
  if (entries.size === 0) {
    throw new Error("Die Datei ist keine Excel-Arbeitsmappe (.xlsx).");
  }
  return entries;
}

function sharedStrings(xml: string) {
  const values: string[] = [];
  const items = xml.match(/<si[\s>][\s\S]*?<\/si>/g) ?? [];
  for (const item of items) {
    const texts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) =>
      decodeXml(match[1] ?? ""),
    );
    values.push(texts.join(""));
  }
  return values;
}

function sheetGrid(xml: string, strings: string[]) {
  const rows: string[][] = [];
  const rowXml = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  for (const row of rowXml) {
    const cells = new Map<number, string>();
    const cellXml = row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? [];
    for (const cell of cellXml) {
      const ref = /r="([A-Z]+\d+)"/i.exec(cell)?.[1] ?? "A1";
      const type = /t="([^"]+)"/.exec(cell)?.[1] ?? "";
      let value = "";
      if (type === "inlineStr") {
        value = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((match) => decodeXml(match[1] ?? ""))
          .join("");
      } else {
        const raw = decodeXml(/<v[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? "");
        if (type === "s") {
          value = strings[Number(raw)] ?? "";
        } else if (type === "b") {
          value = raw === "1" ? "Ja" : "Nein";
        } else {
          value = raw;
        }
      }
      cells.set(columnIndex(ref), value);
    }
    if (cells.size === 0) continue;
    const width = Math.max(...cells.keys()) + 1;
    const line = Array.from({ length: width }, () => "");
    for (const [index, value] of cells) line[index] = value;
    rows.push(line);
  }
  return rows;
}

function sheetPaths(entries: Map<string, Buffer>) {
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const names = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const target = match[2]!.replace(/^\//, "");
    targets.set(
      match[1]!,
      target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`,
    );
  }
  const sheets = names
    .map((match) => ({
      name: decodeXml(match[1]!),
      path: targets.get(match[2]!),
    }))
    .filter((sheet): sheet is { name: string; path: string } => Boolean(sheet.path));
  if (sheets.length > 0) return sheets;
  if (entries.has("xl/worksheets/sheet1.xml")) {
    return [{ name: "Tabelle1", path: "xl/worksheets/sheet1.xml" }];
  }
  return [];
}

export function readXlsxGrids(buffer: Buffer): XlsxGrid[] {
  const entries = unzipEntries(buffer);
  const strings = sharedStrings(
    entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "",
  );
  return sheetPaths(entries).map((sheet) => ({
    sheetName: sheet.name,
    rows: sheetGrid(entries.get(sheet.path)?.toString("utf8") ?? "", strings),
  }));
}

/** Blatt „Mitglieder“, sonst das erste Blatt. */
export function readMemberSheet(buffer: Buffer) {
  const grids = readXlsxGrids(buffer);
  const preferred =
    grids.find((grid) => grid.sheetName.trim().toLowerCase() === "mitglieder") ??
    grids[0];
  if (!preferred || preferred.rows.length === 0) {
    throw new Error("Die Excel-Datei enthält keine Zeilen.");
  }
  return preferred;
}
