import { z } from "zod";
import { parseBirthDate } from "@/lib/format";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ error: "Bitte eine gültige E-Mail-Adresse angeben." });

/** Leer erlaubt; sonst gültige E-Mail (Familienmitglieder / Kinder). */
export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    { error: "Bitte eine gültige E-Mail-Adresse angeben." },
  );

/** Placeholder so several family members can omit a real mailbox (email is unique). */
export const FAMILY_EMAIL_PLACEHOLDER_DOMAIN = "family.local";

export function familyEmailPlaceholder(username: string) {
  const safe = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `no-email-${safe || "member"}@${FAMILY_EMAIL_PLACEHOLDER_DOMAIN}`;
}

export function isFamilyEmailPlaceholder(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? "";
  return value.endsWith(`@${FAMILY_EMAIL_PLACEHOLDER_DOMAIN}`);
}

/** Empty string in forms when the stored value is only a uniqueness placeholder. */
export function displayUserEmail(email: string) {
  return isFamilyEmailPlaceholder(email) ? "" : email;
}

export const DEFAULT_PHONE_COUNTRY_CODE = "+39";

export function parsePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (trimmed.startsWith("00")) {
    const digits = trimmed.slice(2).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;

  if (digits.startsWith("39") && digits.length >= 11) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return `${DEFAULT_PHONE_COUNTRY_CODE}${digits}`;
}

export function parseTaxId(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s./-]/g, "");
  if (!/^[A-Z0-9]{16}$/.test(normalized)) return null;
  return normalized;
}

export function parseStreet(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3 || trimmed.length > 120) return null;
  return trimmed;
}

export function parsePostalCode(value: string) {
  const normalized = value.trim().replace(/\s+/g, "");
  if (!/^\d{4,5}$/.test(normalized)) return null;
  return normalized;
}

export function parseCity(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 80) return null;
  return trimmed;
}

export function parseRequiredProfile(
  input: {
    phone: string;
    taxId: string;
    birthDate: string;
    street: string;
    postalCode: string;
    city: string;
  },
  options?: { phoneOptional?: boolean },
):
  | { ok: false; error: string }
  | {
      ok: true;
      birthDate: Date;
      phone: string;
      taxId: string;
      street: string;
      postalCode: string;
      city: string;
    } {
  const birthDate = parseBirthDate(input.birthDate);
  if (!birthDate) {
    return { ok: false, error: "Bitte ein gültiges Geburtsdatum angeben." };
  }
  const phoneRaw = input.phone.trim();
  let phone = "";
  if (!phoneRaw && !options?.phoneOptional) {
    return { ok: false, error: "Bitte eine gültige Mobilnummer angeben." };
  }
  if (phoneRaw) {
    const parsedPhone = parsePhone(phoneRaw);
    if (!parsedPhone) {
      return { ok: false, error: "Bitte eine gültige Mobilnummer angeben." };
    }
    phone = parsedPhone;
  }
  const taxId = parseTaxId(input.taxId);
  if (!taxId) {
    return {
      ok: false,
      error: "Steuernummer ist nicht gültig.",
    };
  }
  const street = parseStreet(input.street);
  if (!street) {
    return { ok: false, error: "Bitte Straße und Hausnummer angeben." };
  }
  const postalCode = parsePostalCode(input.postalCode);
  if (!postalCode) {
    return { ok: false, error: "Bitte eine gültige Postleitzahl angeben." };
  }
  const city = parseCity(input.city);
  if (!city) {
    return { ok: false, error: "Bitte den Wohnort angeben." };
  }
  return { ok: true, birthDate, phone, taxId, street, postalCode, city };
}

/** Anzeigename bis Stammdaten auf /konto/familie gesetzt sind. */
export const PROFILE_INCOMPLETE_NAME = "—";

/** Sentinel-Geburtsdatum für unvollständige Profile (UTC). */
export const PROFILE_INCOMPLETE_BIRTH = new Date(Date.UTC(1900, 0, 1));

export function isPendingTaxId(taxId: string | null | undefined) {
  return Boolean(taxId?.toUpperCase().startsWith("PEND"));
}

/** Leer im Formular, wenn nur der interne Platzhalter gespeichert ist. */
export function displayUserTaxId(taxId: string | null | undefined) {
  if (!taxId?.trim() || isPendingTaxId(taxId)) return "";
  return taxId.trim();
}

/** Leer im Formular, wenn der Anzeigename noch der Placeholder ist. */
export function displayUserName(name: string | null | undefined) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed === PROFILE_INCOMPLETE_NAME) return "";
  return trimmed;
}

/** Split "Vorname Nachname" for separate form fields (rest stays last name). */
export function splitPersonName(fullName: string | null | undefined) {
  const trimmed = displayUserName(fullName);
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space <= 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function joinPersonName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
}

/** Prefer firstName+lastName fields; fall back to legacy single name. */
export function personNameFromFormData(formData: FormData) {
  const first = String(formData.get("firstName") ?? "").trim();
  const last = String(formData.get("lastName") ?? "").trim();
  if (first || last) return joinPersonName(first, last);
  return String(formData.get("name") ?? "").trim();
}

/** Eindeutige Platzhalter, damit Prisma-Not-Null erfüllt ist. */
export function incompleteProfilePlaceholders(uniqueKey: string) {
  const key = uniqueKey
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12)
    .padEnd(12, "0");
  return {
    name: PROFILE_INCOMPLETE_NAME,
    phone: "",
    taxId: `PEND${key}`.slice(0, 16),
    street: "",
    postalCode: "",
    city: "",
    birthDate: PROFILE_INCOMPLETE_BIRTH,
  };
}

export function isProfileComplete(user: {
  name: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  birthDate: Date;
  email: string;
  canLogin?: boolean;
}): boolean {
  if (user.name.trim() === PROFILE_INCOMPLETE_NAME || user.name.trim().length < 2) {
    return false;
  }
  const nameParts = splitPersonName(user.name);
  if (!nameParts.firstName || !nameParts.lastName) {
    return false;
  }
  if (user.birthDate.getTime() === PROFILE_INCOMPLETE_BIRTH.getTime()) {
    return false;
  }
  if (isPendingTaxId(user.taxId)) return false;

  const phoneOptional = user.canLogin === false;
  const profile = parseRequiredProfile(
    {
      phone: user.phone,
      taxId: user.taxId,
      birthDate: user.birthDate.toISOString().slice(0, 10),
      street: user.street,
      postalCode: user.postalCode,
      city: user.city,
    },
    { phoneOptional },
  );
  if (!profile.ok) return false;

  if (user.canLogin !== false && isFamilyEmailPlaceholder(user.email)) {
    return false;
  }
  return true;
}
