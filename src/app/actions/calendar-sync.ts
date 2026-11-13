"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getActionI18n } from "@/lib/i18n/action";
import { prisma } from "@/lib/prisma";

function newCalendarFeedToken() {
  return randomBytes(24).toString("base64url");
}

export async function setCalendarSyncEnabledAction(enabled: boolean) {
  const { t } = await getActionI18n();
  const user = await getCurrentUser();
  if (!user) return { error: t("account.calendarAuthError") };

  if (enabled) {
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { calendarFeedToken: true },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        calendarSyncEnabled: true,
        calendarFeedToken: existing?.calendarFeedToken ?? newCalendarFeedToken(),
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { calendarSyncEnabled: false },
    });
  }

  revalidatePath("/konto");
  return { ok: true as const };
}

export async function setCalendarSyncChoiceAction(
  choice: "tennis" | "courses" | "childCourses",
  enabled: boolean,
) {
  const { t } = await getActionI18n();
  const user = await getCurrentUser();
  if (!user) return { error: t("account.calendarAuthError") };

  const data =
    choice === "tennis"
      ? { calendarSyncTennis: enabled }
      : choice === "courses"
        ? { calendarSyncCourses: enabled }
        : { calendarSyncChildCourses: enabled };

  await prisma.user.update({
    where: { id: user.id },
    data,
  });
  revalidatePath("/konto");
  return { ok: true as const };
}

export async function rotateCalendarFeedTokenAction() {
  const { t } = await getActionI18n();
  const user = await getCurrentUser();
  if (!user) return { error: t("account.calendarAuthError") };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      calendarSyncEnabled: true,
      calendarFeedToken: newCalendarFeedToken(),
    },
  });
  revalidatePath("/konto");
  return { ok: true as const };
}

/** Tennis-Hinweis „Nein“ – nicht erneut nach Tennis-Buchungen fragen. */
export async function dismissCalendarSyncTennisPromptAction() {
  const { t } = await getActionI18n();
  const user = await getCurrentUser();
  if (!user) return { error: t("account.calendarAuthError") };

  await prisma.user.update({
    where: { id: user.id },
    data: { calendarSyncTennisPromptDismissed: true },
  });
  return { ok: true as const };
}
