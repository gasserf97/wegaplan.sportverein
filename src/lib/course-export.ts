import { formatBirthDate, formatDateTime } from "@/lib/format";
import {
  displayUserEmail,
  displayUserName,
  displayUserTaxId,
} from "@/lib/profile";
import { ageFromBirthDate, resolveAgeBasedPrice } from "@/lib/pricing";
import {
  courseDocumentRequirements,
  DOCUMENT_KIND_FILE_PREFIX,
  DOCUMENT_KIND_LABELS,
  enrollmentHasAllRequiredDocuments,
  medicalCertificateDocument,
  type CourseDocumentFlags,
} from "@/lib/course-documents";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/uploads";
import {
  buildXlsx,
  buildZipBuffer,
  type XlsxCell,
  type XlsxSheet,
} from "@/lib/xlsx-workbook";
import type { EnrollmentDocumentKind } from "@/generated/prisma/client";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const activeCourseEnrollmentWhere = {
  OR: [
    { status: "PAID" as const },
    { status: "WAITLISTED" as const },
    { status: "PENDING" as const, paymentMethod: "BANK_TRANSFER" as const },
  ],
};

export function slugifyExportName(value: string, max = 80) {
  return (
    value
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max) || "kurs"
  );
}

export function exportTimestamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}${get("minute")}`;
}

export function courseExportBasename(courseTitle: string, now = new Date()) {
  return `${slugifyExportName(courseTitle)}-${exportTimestamp(now)}`;
}

export function contentDispositionAttachment(filename: string) {
  const ascii = filename.replace(/[^\w.\-]+/g, "_") || "export";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function sanitizeZipEntryName(value: string, fallback = "datei") {
  const base = value.replace(/[\\/]+/g, "-").replace(/[^\w.\-()äöüÄÖÜß ]+/g, "_");
  return base.replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
}

export function uniqueZipFolderName(name: string, used: Map<string, number>) {
  const base = slugifyExportName(name, 60);
  const count = (used.get(base) ?? 0) + 1;
  used.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function uniqueZipFileName(name: string, used: Set<string>) {
  const sanitized = sanitizeZipEntryName(name);
  const key = sanitized.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return sanitized;
  }
  const dot = sanitized.lastIndexOf(".");
  const stem = dot > 0 ? sanitized.slice(0, dot) : sanitized;
  const ext = dot > 0 ? sanitized.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}-${n}${ext}`;
  while (used.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function yesNo(value: boolean) {
  return value ? "Ja" : "Nein";
}

function compareName(a: string, b: string) {
  return a.localeCompare(b, "de", { sensitivity: "base" });
}

function enrollmentStatusLabel(input: {
  status: string;
  hasAttest: boolean;
  requiresMedicalCertificate: boolean;
}) {
  if (input.status === "PAID") return "Bezahlt";
  if (input.status === "WAITLISTED") return "Warteliste";
  if (input.status === "CANCELLED") return "Storniert";
  if (input.hasAttest) return "Attest OK – Zahlung offen";
  if (input.requiresMedicalCertificate) return "Attest ausstehend";
  return "Zahlung ausstehend";
}

function paymentStatusLabel(status: string) {
  if (status === "PAID") return "Bezahlt";
  if (status === "WAITLISTED") return "Warteliste";
  if (status === "CANCELLED") return "Storniert";
  return "Offen";
}

function paymentChannelLabel(item: {
  paymentMethod: string | null;
  creditAppliedCents: number;
  paidCents: number | null;
  listPriceCents: number;
  bankTransferApprovedAt: Date | null;
  stripeSessionId: string | null;
  settled: boolean;
}) {
  const credit = Math.max(0, item.creditAppliedCents);
  const booked = item.paidCents ?? (item.settled ? item.listPriceCents : 0);
  const external = Math.max(0, booked - credit);
  let channel: string | null = null;
  if (item.paymentMethod === "BANK_TRANSFER") {
    channel =
      item.settled || item.bankTransferApprovedAt
        ? "Überweisung bestätigt"
        : "Überweisung noch nicht bestätigt";
  } else if (item.paymentMethod === "STRIPE" || item.stripeSessionId) {
    channel = "Kreditkarte";
  }
  if (credit > 0 && (external > 0 || Boolean(channel))) {
    return channel ? `${channel} + Guthaben` : "Guthaben";
  }
  if (credit > 0) return "Guthaben";
  if (channel) return channel;
  if (item.settled && item.listPriceCents === 0) return "Kostenlos";
  return "";
}

const enrollmentUserSelect = {
  name: true,
  username: true,
  email: true,
  phone: true,
  taxId: true,
  street: true,
  postalCode: true,
  city: true,
  birthDate: true,
  managedBy: { select: { name: true, email: true, username: true } },
} as const;

export async function buildCourseEnrollmentsWorkbook(
  courseId: string,
  now = new Date(),
) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      section: { select: { name: true } },
      enrollments: {
        where: activeCourseEnrollmentWhere,
        include: {
          user: { select: enrollmentUserSelect },
          purchasedBy: { select: { name: true } },
          documents: true,
        },
      },
    },
  });
  if (!course) return null;

  const documentRequirements = courseDocumentRequirements(course);
  const documentKinds = documentRequirements.map((item) => item.kind);
  const documentHeaders = documentKinds.flatMap((kind) => [
    `${DOCUMENT_KIND_LABELS[kind]} vorhanden`,
    `${DOCUMENT_KIND_LABELS[kind]} Datei`,
    `${DOCUMENT_KIND_LABELS[kind]} hochgeladen am`,
  ]);

  const rows: XlsxCell[][] = [...course.enrollments]
    .sort((a, b) => compareName(a.user.name, b.user.name))
    .map((item) => {
      const listPriceCents = resolveAgeBasedPrice(course, item.user.birthDate)
        .cents;
      const settled = item.status === "PAID";
      const paidCents = item.paidCents ?? (settled ? listPriceCents : null);
      const familyOf = item.user.managedBy
        ? displayUserName(item.user.managedBy.name) ||
          displayUserEmail(item.user.managedBy.email) ||
          item.user.managedBy.username
        : "";
      const bookedBy =
        item.purchasedBy?.name && item.purchasedBy.name !== item.user.name
          ? displayUserName(item.purchasedBy.name)
          : "";
      const age = ageFromBirthDate(item.user.birthDate, now);
      const medical = medicalCertificateDocument(item.documents);
      const docsByKind = new Map(
        item.documents.map((doc) => [doc.kind, doc] as const),
      );
      const allDocumentsComplete =
        documentKinds.length === 0
          ? null
          : enrollmentHasAllRequiredDocuments(course, item.documents);

      const documentCells: XlsxCell[] = documentKinds.flatMap((kind) => {
        const doc = docsByKind.get(kind);
        return [
          yesNo(Boolean(doc)),
          doc?.originalName ?? "",
          doc ? formatDateTime(doc.uploadedAt) : "",
        ];
      });

      return [
        displayUserName(item.user.name) || item.user.username,
        item.user.username,
        displayUserEmail(item.user.email),
        item.user.phone,
        displayUserTaxId(item.user.taxId),
        item.user.street,
        item.user.postalCode,
        item.user.city,
        formatBirthDate(item.user.birthDate),
        age,
        familyOf,
        bookedBy,
        enrollmentStatusLabel({
          status: item.status,
          hasAttest: Boolean(medical),
          requiresMedicalCertificate: course.requiresMedicalCertificate,
        }),
        paymentStatusLabel(item.status),
        paymentChannelLabel({
          paymentMethod: item.paymentMethod,
          creditAppliedCents: item.creditAppliedCents,
          paidCents: item.paidCents,
          listPriceCents,
          bankTransferApprovedAt: item.bankTransferApprovedAt,
          stripeSessionId: item.stripeSessionId,
          settled,
        }),
        paidCents != null ? paidCents / 100 : null,
        item.creditAppliedCents > 0 ? item.creditAppliedCents / 100 : null,
        item.paidAt ? formatDateTime(item.paidAt) : "",
        formatDateTime(item.createdAt),
        item.confirmationEmailSentAt
          ? formatDateTime(item.confirmationEmailSentAt)
          : item.status === "PAID"
            ? "Nicht gesendet"
            : "",
        ...(documentKinds.length > 0
          ? [yesNo(Boolean(allDocumentsComplete)), ...documentCells]
          : []),
      ];
    });

  const sheet: XlsxSheet = {
    name: "Anmeldungen",
    headers: [
      "Name",
      "Benutzername",
      "E-Mail",
      "Telefon",
      "Steuernummer",
      "Straße",
      "PLZ",
      "Ort",
      "Geburtsdatum",
      "Alter",
      "Familienkonto von",
      "Gebucht von",
      "Status",
      "Zahlungsstatus",
      "Zahlungsart",
      "Betrag (€)",
      "Guthaben (€)",
      "Bezahlt am",
      "Angemeldet am",
      "Bestätigung",
      ...(documentKinds.length > 0
        ? ["Alle Dateien hinterlegt", ...documentHeaders]
        : []),
    ],
    rows,
    numberColumns: [9, 15, 16],
  };

  const overviewRows: XlsxCell[][] = [
    ["Kurs", course.title],
    ["Sektion", course.section?.name ?? ""],
    ["Exportiert am", formatDateTime(now)],
    ["Anmeldungen", rows.length],
    ["Dokumente erforderlich", yesNo(course.requiresDocuments)],
  ];
  for (const requirement of documentRequirements) {
    overviewRows.push([
      DOCUMENT_KIND_LABELS[requirement.kind],
      requirement.mandatory ? "Pflicht" : "Optional (nachreichbar)",
    ]);
  }

  const overview: XlsxSheet = {
    name: "Kurs",
    headers: ["Feld", "Wert"],
    rows: overviewRows,
  };

  return {
    buffer: buildXlsx([overview, sheet]),
    filename: `${courseExportBasename(course.title, now)}.xlsx`,
    courseTitle: course.title,
    enrollmentCount: rows.length,
    hasDocumentRequirements: documentKinds.length > 0,
  };
}

function courseFlagsFromCourse(course: {
  requiresDocuments: boolean;
  requiresMedicalCertificate: boolean;
  requiresPassportPhoto: boolean;
  requiresIdFront: boolean;
  requiresIdBack: boolean;
  requiresHealthCard: boolean;
}): CourseDocumentFlags {
  return {
    requiresDocuments: course.requiresDocuments,
    requiresMedicalCertificate: course.requiresMedicalCertificate,
    requiresPassportPhoto: course.requiresPassportPhoto,
    requiresIdFront: course.requiresIdFront,
    requiresIdBack: course.requiresIdBack,
    requiresHealthCard: course.requiresHealthCard,
  };
}

export async function loadCourseDocumentExport(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      enrollments: {
        where: activeCourseEnrollmentWhere,
        include: {
          user: { select: { name: true } },
          documents: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!course) return null;

  const requiredKinds = new Set(
    courseDocumentRequirements(courseFlagsFromCourse(course)).map(
      (item) => item.kind,
    ),
  );
  const usedFolders = new Map<string, number>();
  const entries: Array<{
    zipPath: string;
    storageKey: string;
    kind: EnrollmentDocumentKind;
  }> = [];

  for (const enrollment of course.enrollments) {
    const docs =
      requiredKinds.size > 0
        ? enrollment.documents.filter((doc) => requiredKinds.has(doc.kind))
        : enrollment.documents;
    if (docs.length === 0) continue;
    const folder = uniqueZipFolderName(
      displayUserName(enrollment.user.name) || enrollment.user.name,
      usedFolders,
    );
    const usedNames = new Set<string>();
    for (const doc of docs) {
      const prefix = DOCUMENT_KIND_FILE_PREFIX[doc.kind];
      const fileName = uniqueZipFileName(
        doc.originalName.startsWith(prefix)
          ? doc.originalName
          : `${prefix}-${doc.originalName}`,
        usedNames,
      );
      entries.push({
        zipPath: `Dokumente/${folder}/${fileName}`,
        storageKey: doc.storageKey,
        kind: doc.kind,
      });
    }
  }

  return {
    courseTitle: course.title,
    course,
    entries,
  };
}

async function collectDocumentZipFiles(
  entries: Array<{ zipPath: string; storageKey: string }>,
) {
  const files: Array<{ name: string; data: Buffer }> = [];
  for (const entry of entries) {
    try {
      const fileBuffer = await readStoredFile(entry.storageKey);
      files.push({ name: entry.zipPath, data: fileBuffer });
    } catch {
      files.push({
        name: `${entry.zipPath}.fehlt.txt`,
        data: Buffer.from(`Datei nicht gefunden: ${entry.storageKey}\n`, "utf8"),
      });
    }
  }
  return files;
}

export async function buildCourseDocumentsZip(courseId: string, now = new Date()) {
  const payload = await loadCourseDocumentExport(courseId);
  if (!payload) return null;

  const files =
    payload.entries.length === 0
      ? [
          {
            name: "Keine-Dokumente.txt",
            data: Buffer.from(
              "Keine hochgeladenen Dokumente für diesen Kurs.\n",
              "utf8",
            ),
          },
        ]
      : await collectDocumentZipFiles(
          payload.entries.map((entry) => ({
            zipPath: entry.zipPath.replace(/^Dokumente\//, ""),
            storageKey: entry.storageKey,
          })),
        );

  return {
    buffer: buildZipBuffer(files, now),
    filename: `${courseExportBasename(payload.courseTitle, now)}-dokumente.zip`,
    fileCount: payload.entries.length,
  };
}

/** Excel + alle hochgeladenen Kursdokumente in einem ZIP. */
export async function buildCourseFullExportZip(
  courseId: string,
  now = new Date(),
) {
  const workbook = await buildCourseEnrollmentsWorkbook(courseId, now);
  if (!workbook) return null;

  const documents = await loadCourseDocumentExport(courseId);
  if (!documents) return null;

  const files: Array<{ name: string; data: Buffer }> = [
    { name: "Anmeldungen.xlsx", data: workbook.buffer },
  ];

  if (documents.entries.length === 0) {
    if (workbook.hasDocumentRequirements) {
      files.push({
        name: "Dokumente/Keine-Dokumente.txt",
        data: Buffer.from("Noch keine Dokumente hochgeladen.\n", "utf8"),
      });
    }
  } else {
    files.push(
      ...(await collectDocumentZipFiles(
        documents.entries.map((entry) => ({
          zipPath: entry.zipPath,
          storageKey: entry.storageKey,
        })),
      )),
    );
  }

  return {
    buffer: buildZipBuffer(files, now),
    filename: `${courseExportBasename(workbook.courseTitle, now)}.zip`,
    enrollmentCount: workbook.enrollmentCount,
    fileCount: documents.entries.length,
    hasDocumentRequirements: workbook.hasDocumentRequirements,
  };
}
