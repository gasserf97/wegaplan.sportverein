"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  importMembersFromBuffer,
  type MemberImportResult,
} from "@/lib/member-import";

const MAX_BYTES = 2_000_000;

export type MemberImportState =
  | { error: string }
  | { ok: true; result: MemberImportResult }
  | null;

export async function importMembersAction(
  _prev: MemberImportState,
  formData: FormData,
): Promise<MemberImportState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bitte eine Excel-Datei wählen." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Die Datei ist zu groß (höchstens 2 MB)." };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return { error: "Bitte eine .xlsx-Datei verwenden." };
  }

  try {
    const result = await importMembersFromBuffer(
      Buffer.from(await file.arrayBuffer()),
    );
    revalidatePath("/admin/mitglieder");
    revalidatePath("/konto/familie");
    return { ok: true, result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import fehlgeschlagen.";
    return { error: message };
  }
}
