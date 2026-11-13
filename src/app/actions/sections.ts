"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { COURSE_ACCENTS, resolveAccent } from "@/lib/accents";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sectionListOrderBy } from "@/lib/section-order";
import {
  isValidPaymentEnvKey,
  normalizePaymentEnvKey,
} from "@/lib/section-payments";

export type ActionState =
  | { error: string; fields?: { name: string; accent?: string } }
  | { ok: true }
  | null;

export type SectionPaymentEnvState =
  | {
      error: string;
      fields?: { paymentEnvKey: string };
    }
  | { ok: true }
  | null;

const sectionNameSchema = z
  .string()
  .trim()
  .min(2, { error: "Name mindestens 2 Zeichen." })
  .max(80, { error: "Name höchstens 80 Zeichen." });

function revalidateSectionPaths() {
  revalidatePath("/admin/sektionen");
  revalidatePath("/admin/mitglieder");
  revalidatePath("/admin");
  revalidatePath("/admin/kurse");
  revalidatePath("/admin/abos");
  revalidatePath("/admin/buchhaltung");
  revalidatePath("/admin/tennisplaetze");
  revalidatePath("/admin/geraete");
  revalidatePath("/");
  revalidatePath("/kurse", "layout");
}

export async function createSectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nameRaw = String(formData.get("name") ?? "");
  const accent = resolveAccent(String(formData.get("accent") ?? "red"));
  const sectionError = (error: string): ActionState => ({
    error,
    fields: { name: nameRaw, accent },
  });

  const admin = await requireAdmin();
  if (!admin) return sectionError("Nur Haupt-Administratoren.");

  const parsed = sectionNameSchema.safeParse(nameRaw);
  if (!parsed.success) {
    return sectionError(parsed.error.issues[0]?.message ?? "Ungültiger Name.");
  }

  const existing = await prisma.section.findUnique({
    where: { name: parsed.data },
  });
  if (existing) {
    return sectionError("Diese Sektion existiert bereits.");
  }

  const maxOrder = await prisma.section.aggregate({ _max: { sortOrder: true } });
  await prisma.section.create({
    data: {
      name: parsed.data,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      accent,
    },
  });
  revalidateSectionPaths();
  return { ok: true };
}
export async function updateSectionAccentAction(
  sectionId: string,
  accentRaw: string,
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const accent = resolveAccent(accentRaw);
  if (!(accent in COURSE_ACCENTS) || accent !== accentRaw) {
    return { error: "Unbekannte Farbe." };
  }

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true },
  });
  if (!section) return { error: "Sektion nicht gefunden." };

  await prisma.$transaction([
    prisma.section.update({
      where: { id: sectionId },
      data: { accent },
    }),
    prisma.course.updateMany({
      where: { sectionId },
      data: { accent },
    }),
  ]);

  revalidateSectionPaths();
  return { ok: true };
}

export async function deleteSectionAction(sectionId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) return { error: "Sektion nicht gefunden." };

  const [courseCount, planCount, deviceCount, courtCount, pendingRefundCount] =
    await Promise.all([
      prisma.course.count({ where: { sectionId } }),
      prisma.subscriptionPlan.count({ where: { sectionId } }),
      prisma.device.count({ where: { sectionId } }),
      prisma.court.count({ where: { sectionId } }),
      prisma.pendingRefundTransfer.count({
        where: { sectionId, status: "PENDING" },
      }),
    ]);

  const blockers: string[] = [];
  if (courseCount > 0) {
    blockers.push(`${courseCount} Kurs${courseCount === 1 ? "" : "e"}`);
  }
  if (planCount > 0) {
    blockers.push(
      `${planCount} Mitgliedschaft${planCount === 1 ? "" : "en"}`,
    );
  }
  if (deviceCount > 0) {
    blockers.push(`${deviceCount} Fahrzeug${deviceCount === 1 ? "" : "e"}`);
  }
  if (courtCount > 0) {
    blockers.push(`${courtCount} Tennisplatz${courtCount === 1 ? "" : "plätze"}`);
  }
  if (pendingRefundCount > 0) {
    blockers.push(
      `${pendingRefundCount} offene Rücküberweisung${pendingRefundCount === 1 ? "" : "en"}`,
    );
  }
  if (blockers.length > 0) {
    return {
      error: `Sektion kann nicht gelöscht werden, solange noch zugeordnet: ${blockers.join(", ")}.`,
    };
  }

  await prisma.userSection.deleteMany({ where: { sectionId } });
  await prisma.sectionAdmin.deleteMany({ where: { sectionId } });
  await prisma.section.delete({ where: { id: sectionId } });

  revalidateSectionPaths();
  return { ok: true };
}

export async function moveSectionAction(
  sectionId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const sections = await prisma.section.findMany({
    orderBy: sectionListOrderBy,
    select: { id: true, sortOrder: true },
  });
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return { error: "Sektion nicht gefunden." };

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= sections.length) {
    return { ok: true };
  }

  const current = sections[index];
  const neighbor = sections[swapIndex];

  await prisma.$transaction([
    prisma.section.update({
      where: { id: current.id },
      data: { sortOrder: neighbor.sortOrder },
    }),
    prisma.section.update({
      where: { id: neighbor.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

  // Bei gleichen sortOrder-Werten (Altbestand) neu nummerieren.
  if (current.sortOrder === neighbor.sortOrder) {
    const refreshed = await prisma.section.findMany({
      orderBy: sectionListOrderBy,
      select: { id: true },
    });
    await prisma.$transaction(
      refreshed.map((section, order) =>
        prisma.section.update({
          where: { id: section.id },
          data: { sortOrder: order },
        }),
      ),
    );
  }

  revalidateSectionPaths();
  return { ok: true };
}

export async function updateSectionPaymentEnvKeyAction(
  _prev: SectionPaymentEnvState,
  formData: FormData,
): Promise<SectionPaymentEnvState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Nur Haupt-Administratoren." };

  const sectionId = String(formData.get("sectionId") ?? "").trim();
  if (!sectionId) return { error: "Sektion nicht gefunden." };

  const raw = String(formData.get("paymentEnvKey") ?? "");
  const paymentEnvKey = raw.trim() ? normalizePaymentEnvKey(raw) : "";
  const fields = { paymentEnvKey };

  if (paymentEnvKey && !isValidPaymentEnvKey(paymentEnvKey)) {
    return {
      error:
        "Env-Key muss mit einem Buchstaben beginnen und darf nur A-Z, 0-9 und _ enthalten (max. 40 Zeichen).",
      fields,
    };
  }

  const existing = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!existing) return { error: "Sektion nicht gefunden." };

  if (paymentEnvKey) {
    const duplicate = await prisma.section.findFirst({
      where: {
        paymentEnvKey,
        NOT: { id: sectionId },
      },
      select: { name: true },
    });
    if (duplicate) {
      return {
        error: `Dieser Env-Key wird bereits von „${duplicate.name}“ verwendet.`,
        fields,
      };
    }
  }

  await prisma.section.update({
    where: { id: sectionId },
    data: { paymentEnvKey: paymentEnvKey || null },
  });

  revalidateSectionPaths();
  return { ok: true };
}
