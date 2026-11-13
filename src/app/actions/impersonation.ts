"use server";

import { redirect } from "next/navigation";
import {
  getSessionImpersonatorId,
  requireAdmin,
  setSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ImpersonationState =
  | { error: string }
  | { ok: true }
  | null;

export async function startImpersonationAction(
  targetUserId: string,
): Promise<ImpersonationState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { error: "Nur Haupt-Administratoren können Benutzer simulieren." };
  }

  if (await getSessionImpersonatorId()) {
    return { error: "Beenden Sie zuerst die laufende Simulation." };
  }

  if (!targetUserId || targetUserId === admin.id) {
    return { error: "Ungültige Person für die Simulation." };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!target) {
    return { error: "Person nicht gefunden." };
  }

  if (target.role === "ADMIN") {
    return {
      error: "Andere Haupt-Administratoren können nicht simuliert werden.",
    };
  }

  await setSessionCookie(
    {
      id: target.id,
      username: target.username,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    { impersonatorId: admin.id },
  );

  console.info("Benutzer-Simulation gestartet", {
    adminId: admin.id,
    targetId: target.id,
  });

  redirect("/");
}

export async function stopImpersonationAction(): Promise<ImpersonationState> {
  const impersonatorId = await getSessionImpersonatorId();
  if (!impersonatorId) {
    return { error: "Keine aktive Simulation." };
  }

  const admin = await prisma.user.findUnique({
    where: { id: impersonatorId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!admin || admin.role !== "ADMIN") {
    return { error: "Simulation konnte nicht beendet werden." };
  }

  await setSessionCookie({
    id: admin.id,
    username: admin.username,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });

  console.info("Benutzer-Simulation beendet", { adminId: admin.id });

  redirect("/admin/mitglieder");
}
