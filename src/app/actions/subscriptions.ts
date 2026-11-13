"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAccent } from "@/lib/accents";
import { getCurrentUser, requireCourseManager } from "@/lib/auth";
import { formChecked, formText } from "@/lib/form-draft";
import { parseEuroToCents } from "@/lib/format";
import { canManagePlan, canManageSection } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canActFor } from "@/lib/family";
import {
  isStripeSubscriptionGone,
  syncStripeRecurringToLocalAutoRenew,
} from "@/lib/stripe-subscription-cancel";
import { processDueAutoRenewals } from "@/lib/subscription-renewal";
import { currentAdminSubscriptionFilter } from "@/lib/subscriptions";

export type PlanDraftFields = {
  title: string;
  confirmationTitle: string;
  description: string;
  location: string;
  accent: string;
  priceEuro: string;
  childPriceEuro: string;
  childMaxAge: string;
  audienceMinAge: string;
  audienceMaxAge: string;
  familyBundle: boolean;
  familyPriceEuro: string;
  familyAdults: string;
  familyChildren: string;
  interval: string;
  kind: string;
  published: boolean;
  autoRenewOffered: boolean;
  sendConfirmationEmail: boolean;
  allowBankTransfer: boolean;
  visibleFrom: string;
  visibleUntil: string;
  sectionId: string;
};

export type PlanFormState = { error: string; fields?: PlanDraftFields } | null;

function planDraftFromForm(formData: FormData): PlanDraftFields {
  return {
    title: formText(formData, "title"),
    confirmationTitle: formText(formData, "confirmationTitle"),
    description: formText(formData, "description"),
    location: formText(formData, "location"),
    accent: formText(formData, "accent") || "green",
    priceEuro: formText(formData, "price"),
    childPriceEuro: formText(formData, "childPrice"),
    childMaxAge: formText(formData, "childMaxAge") || "18",
    audienceMinAge: formText(formData, "audienceMinAge"),
    audienceMaxAge: formText(formData, "audienceMaxAge"),
    familyBundle: formChecked(formData, "familyBundle"),
    familyPriceEuro: formText(formData, "familyPrice"),
    familyAdults: formText(formData, "familyAdults") || "2",
    familyChildren: formText(formData, "familyChildren") || "1",
    interval: formText(formData, "interval") || "YEARLY_CALENDAR",
    kind: formText(formData, "kind") || "ADDON",
    published: formChecked(formData, "published"),
    autoRenewOffered: formChecked(formData, "autoRenewOffered"),
    sendConfirmationEmail: formChecked(formData, "sendConfirmationEmail"),
    allowBankTransfer: formChecked(formData, "allowBankTransfer"),
    visibleFrom: formText(formData, "visibleFrom"),
    visibleUntil: formText(formData, "visibleUntil"),
    sectionId: formText(formData, "sectionId"),
  };
}

function planError(error: string, formData: FormData): PlanFormState {
  return { error, fields: planDraftFromForm(formData) };
}

const planSchema = z.object({
  title: z.string().trim().min(3, { error: "Bitte einen Titel angeben." }),
  description: z.string().trim().max(5000),
  location: z.string().trim().min(2, { error: "Bitte den Ort angeben." }),
  accent: z.string(),
  price: z.string().optional(),
  childPrice: z.string().optional(),
  childMaxAge: z.string().optional(),
  interval: z.enum(["MONTHLY", "YEARLY_CALENDAR", "YEARLY_ROLLING", "DAILY"]),
  kind: z.enum(["MEMBERSHIP", "ADDON"]),
  sectionId: z.string().min(1, { error: "Bitte eine Sektion wählen." }),
});

type PlanInput = {
  title: string;
  confirmationTitle: string | null;
  description: string;
  location: string;
  accent: string;
  priceCents: number;
  childPriceCents: number | null;
  childMaxAge: number;
  audienceMinAge: number | null;
  audienceMaxAge: number | null;
  pricingMode: "PER_PERSON" | "FAMILY_BUNDLE";
  familyPriceCents: number | null;
  familyAdults: number | null;
  familyChildren: number | null;
  interval: "MONTHLY" | "YEARLY_CALENDAR" | "YEARLY_ROLLING" | "DAILY";
  kind: "MEMBERSHIP" | "ADDON";
  published: boolean;
  autoRenewOffered: boolean;
  sendConfirmationEmail: boolean;
  allowBankTransfer: boolean;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  sectionId: string;
};

function parseOptionalInt(
  value: FormDataEntryValue | null,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `Bitte einen gültigen Wert für ${label} angeben.` };
  }
  return { ok: true, value: parsed };
}

function parseOptionalCount(
  value: FormDataEntryValue | null,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { ok: false, error: `Bitte einen gültigen Wert für ${label} angeben.` };
  }
  return { ok: true, value: parsed };
}

function parsePlan(
  formData: FormData,
): { ok: true; data: PlanInput } | { ok: false; error: string } {
  const parsed = planSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    location: formData.get("location"),
    accent: formData.get("accent"),
    price: formData.get("price"),
    childPrice: formData.get("childPrice") ?? "",
    childMaxAge: formData.get("childMaxAge") ?? "18",
    interval: formData.get("interval"),
    kind: formData.get("kind") || "ADDON",
    sectionId: formData.get("sectionId"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." };
  }

  const priceRaw = parsed.data.price?.trim() ?? "";
  const childRaw = parsed.data.childPrice?.trim() ?? "";
  if (!priceRaw && !childRaw) {
    return {
      ok: false,
      error: "Bitte einen Erwachsenen- oder Kinderpreis in Euro angeben.",
    };
  }

  let priceCents = 0;
  if (priceRaw) {
    const parsedAdult = parseEuroToCents(priceRaw);
    if (parsedAdult === null) {
      return {
        ok: false,
        error: "Bitte einen gültigen Erwachsenenpreis in Euro angeben.",
      };
    }
    priceCents = parsedAdult;
  }

  let childPriceCents: number | null = null;
  if (childRaw) {
    childPriceCents = parseEuroToCents(childRaw);
    if (childPriceCents === null) {
      return { ok: false, error: "Bitte einen gültigen Kinderpreis in Euro angeben." };
    }
  }

  const childMaxAge = Number.parseInt(parsed.data.childMaxAge || "18", 10);
  if (!Number.isFinite(childMaxAge) || childMaxAge < 1 || childMaxAge > 21) {
    return { ok: false, error: "Kinderpreis: Alter zwischen 1 und 21 Jahren angeben." };
  }

  const audienceMinAge = parseOptionalInt(formData.get("audienceMinAge"), "Mindestalter");
  if (!audienceMinAge.ok) return { ok: false, error: audienceMinAge.error };

  const audienceMaxAge = parseOptionalInt(formData.get("audienceMaxAge"), "Höchstalter");
  if (!audienceMaxAge.ok) return { ok: false, error: audienceMaxAge.error };

  if (
    audienceMinAge.value != null &&
    audienceMaxAge.value != null &&
    audienceMinAge.value > audienceMaxAge.value
  ) {
    return {
      ok: false,
      error: "Das Mindestalter darf nicht höher als das Höchstalter sein.",
    };
  }

  const isFamilyBundle = formData.get("familyBundle") === "on";
  let familyPriceCents: number | null = null;
  let familyAdults: number | null = null;
  let familyChildren: number | null = null;
  let pricingMode: "PER_PERSON" | "FAMILY_BUNDLE" = "PER_PERSON";

  if (isFamilyBundle) {
    if (!priceRaw) {
      return {
        ok: false,
        error: "Für die Familienkarte bitte auch einen Erwachsenenpreis angeben.",
      };
    }
    const familyPriceRaw = String(formData.get("familyPrice") ?? "").trim();
    familyPriceCents = parseEuroToCents(familyPriceRaw);
    if (familyPriceCents === null) {
      return { ok: false, error: "Bitte einen gültigen Familienpreis in Euro angeben." };
    }
    if (childPriceCents == null) {
      return {
        ok: false,
        error: "Für die Familienkarte bitte auch einen Kinderpreis angeben.",
      };
    }

    const adults = parseOptionalCount(formData.get("familyAdults"), "Erwachsene");
    if (!adults.ok) return { ok: false, error: adults.error };

    const children = parseOptionalCount(formData.get("familyChildren"), "Kinder");
    if (!children.ok) return { ok: false, error: children.error };

    familyAdults = adults.value ?? 2;
    familyChildren = children.value ?? 1;
    pricingMode = "FAMILY_BUNDLE";
  }

  const visibleFromRaw = String(formData.get("visibleFrom") ?? "").trim();
  const visibleFrom = visibleFromRaw
    ? new Date(`${visibleFromRaw}T00:00:00`)
    : null;
  if (visibleFrom && Number.isNaN(visibleFrom.getTime())) {
    return { ok: false, error: "Bitte ein gültiges Datum für „Sichtbar ab“ wählen." };
  }

  const visibleUntilRaw = String(formData.get("visibleUntil") ?? "").trim();
  const visibleUntil = visibleUntilRaw
    ? new Date(`${visibleUntilRaw}T23:59:59`)
    : null;
  if (visibleUntil && Number.isNaN(visibleUntil.getTime())) {
    return {
      ok: false,
      error: "Bitte ein gültiges Datum für „Sichtbar bis“ wählen.",
    };
  }
  if (visibleFrom && visibleUntil && visibleUntil < visibleFrom) {
    return {
      ok: false,
      error: "„Sichtbar bis“ darf nicht vor „Sichtbar ab“ liegen.",
    };
  }

  const confirmationTitleRaw = formText(formData, "confirmationTitle").trim();
  const confirmationTitle =
    confirmationTitleRaw.length > 0 ? confirmationTitleRaw.slice(0, 200) : null;

  return {
    ok: true,
    data: {
      title: parsed.data.title,
      confirmationTitle,
      description: parsed.data.description,
      location: parsed.data.location,
      accent: resolveAccent(parsed.data.accent),
      priceCents,
      childPriceCents,
      childMaxAge,
      audienceMinAge: audienceMinAge.value,
      audienceMaxAge: audienceMaxAge.value,
      pricingMode,
      familyPriceCents,
      familyAdults,
      familyChildren,
      interval: parsed.data.interval,
      kind: parsed.data.kind,
      published: formData.get("published") === "on",
      autoRenewOffered: formData.get("autoRenewOffered") === "on",
      sendConfirmationEmail: parsed.data.kind === "ADDON",
      allowBankTransfer: formData.get("allowBankTransfer") === "on",
      visibleFrom,
      visibleUntil,
      sectionId: parsed.data.sectionId,
    },
  };
}

function revalidatePlans(planId?: string) {
  revalidatePath("/");
  revalidatePath("/abos");
  revalidatePath("/admin");
  revalidatePath("/admin/abos");
  if (planId) revalidatePath(`/abos/${planId}`);
}

export async function createPlanAction(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const manager = await requireCourseManager();
  if (!manager) {
    return planError("Keine Berechtigung, Mitgliedschaften anzulegen.", formData);
  }

  const parsed = parsePlan(formData);
  if (!parsed.ok) return planError(parsed.error, formData);

  if (parsed.data.interval === "DAILY" && manager.role !== "ADMIN") {
    return planError(
      "Tägliches Intervall ist nur für Administratoren (Test).",
      formData,
    );
  }

  if (!(await canManageSection(manager.id, parsed.data.sectionId))) {
    return planError(
      "Sie dürfen für diese Sektion keine Mitgliedschaften anlegen.",
      formData,
    );
  }

  await prisma.subscriptionPlan.create({
    data: {
      ...parsed.data,
      createdById: manager.id,
    },
  });
  revalidatePlans();
  redirect("/admin/abos");
}

export async function updatePlanAction(
  planId: string,
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const manager = await requireCourseManager();
  if (!manager) {
    return planError("Keine Berechtigung, Mitgliedschaften zu bearbeiten.", formData);
  }

  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!existing) {
    return planError("Mitgliedschaft nicht gefunden.", formData);
  }

  if (!(await canManagePlan(manager.id, existing))) {
    return planError("Sie dürfen diese Mitgliedschaft nicht bearbeiten.", formData);
  }

  const parsed = parsePlan(formData);
  if (!parsed.ok) return planError(parsed.error, formData);

  if (
    parsed.data.interval === "DAILY" &&
    manager.role !== "ADMIN" &&
    existing.interval !== "DAILY"
  ) {
    return planError(
      "Tägliches Intervall ist nur für Administratoren (Test).",
      formData,
    );
  }

  if (!(await canManageSection(manager.id, parsed.data.sectionId))) {
    return planError(
      "Sie dürfen für diese Sektion keine Mitgliedschaften pflegen.",
      formData,
    );
  }

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: {
      ...parsed.data,
      createdById: existing.createdById ?? manager.id,
    },
  });
  revalidatePlans(planId);
  redirect("/admin/abos");
}

export async function togglePlanPublishedAction(planId: string) {
  const manager = await requireCourseManager();
  if (!manager) {
    throw new Error("Nicht berechtigt.");
  }

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new Error("Mitgliedschaft nicht gefunden.");
  }

  if (!(await canManagePlan(manager.id, plan))) {
    throw new Error("Nicht berechtigt.");
  }

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { published: !plan.published },
  });
  revalidatePlans(planId);
}

export async function deletePlanAction(planId: string): Promise<{ error: string } | null> {
  const manager = await requireCourseManager();
  if (!manager) {
    return { error: "Keine Berechtigung, Mitgliedschaften zu löschen." };
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    include: {
      _count: {
        select: {
          subscriptions: { where: currentAdminSubscriptionFilter() },
        },
      },
    },
  });

  if (!plan) {
    return { error: "Mitgliedschaft nicht gefunden." };
  }

  if (!(await canManagePlan(manager.id, plan))) {
    return { error: "Sie dürfen diese Mitgliedschaft nicht löschen." };
  }

  if (plan._count.subscriptions > 0) {
    return {
      error:
        "Diese Mitgliedschaft kann nicht gelöscht werden, weil bereits jemand eingeschrieben ist.",
    };
  }

  await prisma.subscription.deleteMany({ where: { planId } });
  await prisma.subscriptionPlan.delete({ where: { id: planId } });
  revalidatePlans();
  redirect("/admin/abos");
}

export async function setSubscriptionAutoRenewAction(
  subscriptionId: string,
  autoRenew: boolean,
): Promise<{ error: string } | null> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Bitte anmelden." };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });

  if (
    !subscription ||
    (!(await canActFor(user.id, subscription.userId)) &&
      subscription.purchasedById !== user.id &&
      user.role !== "ADMIN")
  ) {
    return { error: "Mitgliedschaft nicht gefunden." };
  }

  if (subscription.status !== "ACTIVE") {
    return { error: "Nur aktive Mitgliedschaften können angepasst werden." };
  }

  if (autoRenew && !subscription.plan.autoRenewOffered) {
    return {
      error:
        "Für diese Mitgliedschaft ist keine automatische Verlängerung vorgesehen.",
    };
  }

  if (
    subscription.stripeSubscriptionId ||
    subscription.stripeSessionId
  ) {
    try {
      await syncStripeRecurringToLocalAutoRenew({
        id: subscription.id,
        autoRenew,
        periodEnd: subscription.periodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeSessionId: subscription.stripeSessionId,
      });
    } catch (error) {
      if (!isStripeSubscriptionGone(error)) {
        console.error("Stripe autoRenew", error);
        return {
          error:
            "Die Einstellung konnte bei Stripe nicht gespeichert werden. Bitte später erneut versuchen.",
        };
      }
    }
  }

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { autoRenew },
  });

  if (autoRenew) {
    await processDueAutoRenewals();
  }

  revalidatePath("/konto");
  return null;
}
