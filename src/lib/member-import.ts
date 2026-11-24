import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { parseBirthDate } from "@/lib/format";
import {
  familyEmailPlaceholder,
  isFamilyEmailPlaceholder,
  isPendingTaxId,
  joinPersonName,
  parsePhone,
  parseTaxId,
  splitPersonName,
} from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { readMemberSheet } from "@/lib/xlsx-read";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx-workbook";
import {
  allocateUniqueUsername,
  normalizeUsername,
  usernameCandidateFromEmail,
} from "@/lib/username";

export const MEMBER_IMPORT_HEADERS = [
  "Familiennummer",
  "Kontoinhaber",
  "Vorname",
  "Nachname",
  "E-Mail",
  "Telefon",
  "Steuernummer",
  "Straße",
  "PLZ",
  "Ort",
  "Geburtsdatum",
  "Login möglich",
] as const;

export type MemberImportNotice = {
  row: number;
  message: string;
};

export type MemberImportResult = {
  created: number;
  updated: number;
  linked: number;
  notices: MemberImportNotice[];
};

type ExistingUser = {
  id: string;
  email: string;
  taxId: string;
  username: string;
  name: string;
  managedById: string | null;
  dependentCount: number;
};

type PreparedRow = {
  row: number;
  familyKey: string;
  accountHolder: boolean | null;
  familyOf: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  birthDate: Date | null;
  canLogin: boolean | null;
};

function headerKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");
}

function cell(row: string[], index: number) {
  return (row[index] ?? "").trim();
}

function parseYesNo(value: string): boolean | null {
  const text = headerKey(value);
  if (!text) return null;
  if (["ja", "j", "yes", "y", "1", "wahr", "true"].includes(text)) return true;
  if (["nein", "n", "no", "0", "falsch", "false"].includes(text)) return false;
  return null;
}

function excelSerialToDate(serial: number) {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  const date = new Date(utc);
  const iso = date.toISOString().slice(0, 10);
  return parseBirthDate(iso);
}

function parseImportBirthDate(value: string) {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return parseBirthDate(`${iso[1]}-${iso[2]}-${iso[3]}`);
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (german) {
    const day = german[1]!.padStart(2, "0");
    const month = german[2]!.padStart(2, "0");
    return parseBirthDate(`${german[3]}-${month}-${day}`);
  }
  if (/^\d+(\.\d+)?$/.test(value)) return excelSerialToDate(Number(value));
  return null;
}

function blankRow(values: string[]) {
  return values.every((value) => value.trim() === "");
}

function prepareRows(grid: string[][]) {
  const headers = (grid[0] ?? []).map(headerKey);
  const indexOf = new Map<string, number>();
  headers.forEach((header, index) => {
    if (header && !indexOf.has(header)) indexOf.set(header, index);
  });
  if (!indexOf.has("vorname") && !indexOf.has("name") && !indexOf.has("e-mail") && !indexOf.has("email")) {
    throw new Error(
      "Die erste Zeile braucht die Spalten der Vorlage, zum Beispiel Vorname, Nachname und E-Mail.",
    );
  }

  const rows: PreparedRow[] = [];
  const notices: MemberImportNotice[] = [];
  for (let i = 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    if (blankRow(line)) continue;
    const read = (header: string) => {
      const index = indexOf.get(header);
      return index == null ? "" : cell(line, index);
    };
    const name = read("name");
    const parts = splitPersonName(name);
    const birthRaw = read("geburtsdatum");
    const birthDate = birthRaw ? parseImportBirthDate(birthRaw) : null;
    if (birthRaw && !birthDate) {
      notices.push({
        row: i + 1,
        message: `Geburtsdatum „${birthRaw}“ ist ungültig.`,
      });
      continue;
    }
    const taxRaw = read("steuernummer");
    const taxId = taxRaw ? parseTaxId(taxRaw) : "";
    if (taxRaw && !taxId) {
      notices.push({
        row: i + 1,
        message: "Steuernummer ist nicht gültig.",
      });
      continue;
    }
    const email = read("e-mail") || read("email");
    const holderRaw = read("kontoinhaber");
    const loginRaw = read("login moeglich");
    const holder = parseYesNo(holderRaw);
    const canLogin = parseYesNo(loginRaw);
    if (holderRaw && holder == null) {
      notices.push({ row: i + 1, message: "Kontoinhaber bitte mit Ja oder Nein füllen." });
      continue;
    }
    if (loginRaw && canLogin == null) {
      notices.push({ row: i + 1, message: "Login möglich bitte mit Ja oder Nein füllen." });
      continue;
    }
    rows.push({
      row: i + 1,
      familyKey: read("familiennummer"),
      accountHolder: holder,
      familyOf: read("familienkonto von"),
      username: read("benutzername"),
      firstName: read("vorname") || parts.firstName,
      lastName: read("nachname") || parts.lastName,
      email: email.toLowerCase(),
      phone: read("telefon") || read("mobiltelefon"),
      taxId: taxId ?? "",
      street: read("strasse"),
      postalCode: read("plz"),
      city: read("ort"),
      birthDate,
      canLogin,
    });
  }
  return { rows, notices };
}

function personLabel(row: PreparedRow) {
  return joinPersonName(row.firstName, row.lastName) || row.email || `Zeile ${row.row}`;
}

function chooseHolders(group: PreparedRow[], notices: MemberImportNotice[]) {
  const marked = group.filter((row) => row.accountHolder === true);
  if (group.some((row) => row.accountHolder != null)) {
    if (marked.length !== 1) {
      for (const row of group) {
        notices.push({
          row: row.row,
          message: "Jede Familiennummer braucht genau einen Kontoinhaber (Ja).",
        });
      }
      return null;
    }
    return marked[0]!;
  }
  const adults = group.filter((row) => row.canLogin !== false);
  const holder = adults[0] ?? null;
  if (!holder) {
    for (const row of group) {
      notices.push({
        row: row.row,
        message: "Familiennummer ohne Kontoinhaber mit Login.",
      });
    }
    return null;
  }
  if (adults.length > 1) {
    notices.push({
      row: holder.row,
      message: `${personLabel(holder)} wird Kontoinhaber, weil niemand mit Ja markiert ist.`,
    });
  }
  return holder;
}

function matchExisting(row: PreparedRow, users: ExistingUser[]) {
  const byTax = row.taxId
    ? users.find((user) => user.taxId.toUpperCase() === row.taxId.toUpperCase())
    : undefined;
  const byEmail =
    row.email && !isFamilyEmailPlaceholder(row.email)
      ? users.find((user) => user.email.toLowerCase() === row.email)
      : undefined;
  const byUsername = row.username
    ? users.find((user) => user.username === normalizeUsername(row.username))
    : undefined;
  const found = [byTax, byEmail, byUsername].filter(
    (user): user is ExistingUser => Boolean(user),
  );
  const ids = new Set(found.map((user) => user.id));
  if (ids.size > 1) return { error: "E-Mail, Steuernummer und Benutzername gehören zu verschiedenen Personen." };
  return { user: found[0] ?? null };
}

export function memberImportTemplateBuffer() {
  const rows: XlsxCell[][] = [
    ["1", "Ja", "Anna", "Berger", "anna.berger@example.com", "+393331110001", "BRGNNA80A41H501U", "Dorfstraße 1", "39040", "Lajen", "1980-01-01", "Ja"],
    ["1", "Nein", "Mia", "Berger", "", "", "BRGMIA15A41H501U", "", "", "", "2015-01-01", "Nein"],
  ];
  return buildXlsx([
    {
      name: "Mitglieder",
      headers: [...MEMBER_IMPORT_HEADERS],
      rows,
    },
  ]);
}

export async function importMembersFromBuffer(buffer: Buffer): Promise<MemberImportResult> {
  const grid = readMemberSheet(buffer).rows;
  return importMemberGrid(grid);
}

export async function importMemberGrid(grid: string[][]): Promise<MemberImportResult> {
  const prepared = prepareRows(grid);
  const notices = prepared.notices;
  const skippedRows = new Set(notices.map((item) => item.row));
  const groups = new Map<string, PreparedRow[]>();
  for (const row of prepared.rows) {
    if (!row.familyKey) continue;
    const list = groups.get(row.familyKey) ?? [];
    list.push(row);
    groups.set(row.familyKey, list);
  }
  const holderByKey = new Map<string, PreparedRow>();
  for (const [key, group] of groups) {
    const holder = chooseHolders(group, notices);
    if (!holder) {
      for (const row of group) skippedRows.add(row.row);
      continue;
    }
    if (holder.canLogin === false) {
      notices.push({
        row: holder.row,
        message: "Der Kontoinhaber braucht einen Login.",
      });
      for (const row of group) skippedRows.add(row.row);
      continue;
    }
    holderByKey.set(key, holder);
  }

  const usable = prepared.rows.filter((row) => !skippedRows.has(row.row));
  for (const row of usable) {
    if (!row.firstName || !row.lastName) {
      notices.push({ row: row.row, message: "Vorname und Nachname fehlen." });
      skippedRows.add(row.row);
    }
  }
  const ready = usable.filter((row) => !skippedRows.has(row.row));

  const existing = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      taxId: true,
      username: true,
      name: true,
      managedById: true,
      _count: { select: { dependents: true } },
    },
  });
  const known: ExistingUser[] = existing.map((user) => ({
    id: user.id,
    email: user.email,
    taxId: user.taxId,
    username: user.username,
    name: user.name,
    managedById: user.managedById,
    dependentCount: user._count.dependents,
  }));

  const resolved = new Map<number, { row: PreparedRow; id: string; created: boolean }>();
  let created = 0;
  let updated = 0;

  for (const row of ready) {
    const match = matchExisting(row, known);
    if ("error" in match && match.error) {
      notices.push({ row: row.row, message: match.error });
      continue;
    }
    const current = match.user;
    if (!current && !row.birthDate) {
      notices.push({ row: row.row, message: "Neue Personen brauchen ein Geburtsdatum." });
      continue;
    }
    const wantsLogin = row.canLogin !== false;
    if (!current && wantsLogin && !row.email) {
      notices.push({ row: row.row, message: "Mit Login braucht die Person eine E-Mail." });
      continue;
    }
    if (row.email && !row.email.includes("@")) {
      notices.push({ row: row.row, message: "E-Mail ist ungültig." });
      continue;
    }
    let phone = "";
    if (row.phone) {
      const parsedPhone = parsePhone(row.phone);
      if (!parsedPhone) {
        notices.push({ row: row.row, message: "Telefonnummer ist ungültig." });
        continue;
      }
      phone = parsedPhone;
    }

    try {
      if (current) {
        await prisma.user.update({
          where: { id: current.id },
          data: {
            name: joinPersonName(row.firstName, row.lastName),
            ...(row.email && !isFamilyEmailPlaceholder(row.email) ? { email: row.email } : {}),
            ...(phone ? { phone } : {}),
            ...(row.taxId && !isPendingTaxId(row.taxId) ? { taxId: row.taxId } : {}),
            ...(row.street ? { street: row.street } : {}),
            ...(row.postalCode ? { postalCode: row.postalCode } : {}),
            ...(row.city ? { city: row.city } : {}),
            ...(row.birthDate ? { birthDate: row.birthDate } : {}),
            ...(row.canLogin == null ? {} : { canLogin: row.canLogin }),
          },
        });
        current.name = joinPersonName(row.firstName, row.lastName);
        if (row.email) current.email = row.email;
        if (row.taxId) current.taxId = row.taxId;
        updated += 1;
        resolved.set(row.row, { row, id: current.id, created: false });
        continue;
      }

      const usernameBase = row.username
        ? normalizeUsername(row.username)
        : row.email
          ? usernameCandidateFromEmail(row.email)
          : usernameCandidateFromEmail(`${row.firstName}.${row.lastName}@mitglied.local`);
      const username = await allocateUniqueUsername(usernameBase);
      const email = row.email || familyEmailPlaceholder(username);
      const taxId =
        row.taxId ||
        `PEND${randomBytes(8).toString("hex").toUpperCase()}`.slice(0, 16);
      const user = await prisma.user.create({
        data: {
          username,
          name: joinPersonName(row.firstName, row.lastName),
          email,
          phone,
          taxId,
          street: row.street,
          postalCode: row.postalCode,
          city: row.city,
          birthDate: row.birthDate!,
          passwordHash: await hash(randomBytes(24).toString("hex"), 10),
          canLogin: wantsLogin,
          emailVerifiedAt: new Date(),
        },
      });
      known.push({
        id: user.id,
        email: user.email,
        taxId: user.taxId,
        username: user.username,
        name: user.name,
        managedById: null,
        dependentCount: 0,
      });
      created += 1;
      resolved.set(row.row, { row, id: user.id, created: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
      notices.push({
        row: row.row,
        message: message.includes("Unique constraint")
          ? "E-Mail oder Benutzername ist bereits vergeben."
          : "Speichern fehlgeschlagen.",
      });
    }
  }

  let linked = 0;
  for (const item of resolved.values()) {
    const { row } = item;
    const user = known.find((entry) => entry.id === item.id);
    if (!user) continue;
    let rootId: string | null = null;
    if (row.familyKey) {
      const holder = holderByKey.get(row.familyKey);
      const holderResolved = holder ? resolved.get(holder.row) : undefined;
      if (!holder || !holderResolved) {
        notices.push({
          row: row.row,
          message: "Der Kontoinhaber dieser Familiennummer wurde nicht gespeichert.",
        });
        continue;
      }
      if (holder.row === row.row) {
        if (user.managedById) {
          notices.push({
            row: row.row,
            message: "Kontoinhaber gehört schon zu einer anderen Familie und bleibt dort.",
          });
        }
        continue;
      }
      rootId = holderResolved.id;
    } else if (row.familyOf) {
      rootId = resolveFamilyOf(row.familyOf, resolved, known);
      if (!rootId) {
        notices.push({
          row: row.row,
          message: `Familienkonto „${row.familyOf}“ ist nicht eindeutig auffindbar.`,
        });
        continue;
      }
    } else {
      continue;
    }
    if (rootId === user.id) continue;
    if (user.dependentCount > 0) {
      notices.push({
        row: row.row,
        message: "Person hat selbst Angehörige und wird nicht in eine andere Familie verschoben.",
      });
      continue;
    }
    if (user.managedById && user.managedById !== rootId) {
      notices.push({
        row: row.row,
        message: "Person gehört schon zu einer anderen Familie und wird nicht umgehängt.",
      });
      continue;
    }
    if (user.managedById === rootId) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { managedById: rootId },
    });
    user.managedById = rootId;
    const root = known.find((entry) => entry.id === rootId);
    if (root) root.dependentCount += 1;
    linked += 1;
  }

  notices.sort((a, b) => a.row - b.row);
  return { created, updated, linked, notices };
}

function resolveFamilyOf(
  label: string,
  resolved: Map<number, { row: PreparedRow; id: string }>,
  known: ExistingUser[],
) {
  const needle = label.trim().toLowerCase();
  const imported = [...resolved.values()].filter((item) => {
    const name = joinPersonName(item.row.firstName, item.row.lastName).toLowerCase();
    return name === needle || item.row.email === needle || item.row.username.toLowerCase() === needle;
  });
  if (imported.length === 1) return imported[0]!.id;
  if (imported.length > 1) return null;
  const stored = known.filter((user) => {
    return (
      user.email.toLowerCase() === needle ||
      user.username.toLowerCase() === needle ||
      user.name.trim().toLowerCase() === needle
    );
  });
  if (stored.length === 1) return stored[0]!.id;
  return null;
}
