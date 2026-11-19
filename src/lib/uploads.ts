import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/octet-stream",
]);

const EXTENSION_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const MAX_BYTES = 10 * 1024 * 1024;

function resolveMimeType(file: File) {
  const trimmed = file.type?.trim() ?? "";
  if (trimmed && ALLOWED_MIME.has(trimmed) && trimmed !== "application/octet-stream") {
    return trimmed;
  }

  const ext = path.extname(file.name).toLowerCase();
  return EXTENSION_MIME[ext] ?? trimmed;
}

export function uploadRootDir() {
  const configured = process.env.UPLOAD_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "uploads");
}

export function validateEnrollmentDocumentFile(file: File) {
  if (!file || file.size === 0) {
    return { ok: false as const, error: "Bitte eine Datei auswählen." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false as const, error: "Die Datei darf maximal 10 MB groß sein." };
  }

  const mimeType = resolveMimeType(file);
  const ext = path.extname(file.name).toLowerCase();
  const allowedByMime = mimeType && ALLOWED_MIME.has(mimeType);
  const allowedByExt = ext in EXTENSION_MIME;

  if (!allowedByMime && !allowedByExt) {
    return {
      ok: false as const,
      error: "Erlaubt sind PDF, JPG, PNG oder WebP.",
    };
  }

  return { ok: true as const, mimeType: mimeType || EXTENSION_MIME[ext] };
}

/** @deprecated Use validateEnrollmentDocumentFile */
export const validateMedicalCertificateFile = validateEnrollmentDocumentFile;

function sanitizeFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\-()äöüÄÖÜß ]+/g, "_");
  return base.slice(0, 120) || "dokument.pdf";
}

export async function saveEnrollmentDocumentFile(
  courseId: string,
  enrollmentId: string,
  file: File,
  kindFolder = "documents",
) {
  const validation = validateEnrollmentDocumentFile(file);
  if (!validation.ok) return validation;

  const storageKey = path.posix.join(
    kindFolder,
    courseId,
    enrollmentId,
    `${randomUUID()}-${sanitizeFileName(file.name)}`,
  );
  const absolutePath = path.join(uploadRootDir(), storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    ok: true as const,
    storageKey,
    originalName: sanitizeFileName(file.name),
    mimeType: validation.mimeType,
    sizeBytes: file.size,
  };
}

export async function saveMedicalCertificateFile(
  courseId: string,
  enrollmentId: string,
  file: File,
) {
  return saveEnrollmentDocumentFile(courseId, enrollmentId, file, "attests");
}

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function sniffImageMime(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function saveSniffedImage(
  file: File,
  storageKeyBase: string,
  maxBytes: number,
  emptyMessage: string,
  tooBigMessage: string,
) {
  if (!file || file.size === 0) {
    return { ok: false as const, error: emptyMessage };
  }
  if (file.size > maxBytes) {
    return { ok: false as const, error: tooBigMessage };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffImageMime(buffer);
  if (!mimeType) {
    return { ok: false as const, error: "Erlaubt sind JPG, PNG oder WebP." };
  }

  const declared = file.type?.trim() ?? "";
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== mimeType
  ) {
    return { ok: false as const, error: "Erlaubt sind JPG, PNG oder WebP." };
  }

  const storageKey = `${storageKeyBase}${IMAGE_EXT[mimeType]}`;
  const absolutePath = path.join(uploadRootDir(), storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    ok: true as const,
    storageKey,
    mimeType,
    sizeBytes: buffer.length,
  };
}

/** Speichert ein Hinweis-Bild. Der Ordner ist unabhängig von der Event-Id. */
export async function saveClubEventImage(file: File) {
  return saveSniffedImage(
    file,
    path.posix.join("events", randomUUID(), randomUUID()),
    MAX_BYTES,
    "Bitte ein Bild auswählen.",
    "Das Bild darf maximal 10 MB groß sein.",
  );
}

/** Speichert das Logo eines Vereins. Ersetzt die bisherige Datei nicht selbst. */
export async function saveClubLogo(clubId: string, file: File) {
  if (!/^[a-zA-Z0-9_-]+$/.test(clubId)) {
    return { ok: false as const, error: "Kein Verein im Kontext." };
  }
  return saveSniffedImage(
    file,
    path.posix.join("club", clubId, randomUUID()),
    LOGO_MAX_BYTES,
    "Bitte ein Logo auswählen.",
    "Das Logo darf maximal 2 MB groß sein.",
  );
}

export async function readStoredFile(storageKey: string) {
  const absolutePath = path.join(uploadRootDir(), storageKey);
  const normalizedRoot = path.resolve(uploadRootDir());
  if (!path.resolve(absolutePath).startsWith(normalizedRoot)) {
    throw new Error("Ungültiger Speicherpfad.");
  }
  return readFile(absolutePath);
}

export async function deleteStoredFile(storageKey: string) {
  const absolutePath = path.join(uploadRootDir(), storageKey);
  const normalizedRoot = path.resolve(uploadRootDir());
  if (!path.resolve(absolutePath).startsWith(normalizedRoot)) {
    return;
  }
  await unlink(absolutePath).catch(() => undefined);
}
