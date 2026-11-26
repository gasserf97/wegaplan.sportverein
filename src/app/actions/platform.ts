"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { encryptSecret } from "@/lib/club-secrets";
import { issueEmailVerification } from "@/lib/email-verification";
import {
  clearPlatformSession,
  createPlatformEnterToken,
  getPlatformAdmin,
  loginPlatformAdmin,
  setPlatformSession,
} from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { incompleteProfilePlaceholders } from "@/lib/profile";
import { platformDomain, supportsClubSubdomains } from "@/lib/host";
import {
  clearClubHostCache,
  clubPublicUrl,
  platformBaseUrl,
  requestHostHeader,
  runWithClub,
} from "@/lib/tenant";
import {
  allocateUniqueUsername,
  usernameCandidateFromEmail,
} from "@/lib/username";

function isUsablePublicOrigin(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host !== "0.0.0.0" && host !== "::" && host !== "[::]";
  } catch {
    return false;
  }
}

export type PlatformState = { error: string } | null;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** DNS-tauglich: Umlaute → ae/oe/ue, sonst nur a-z, 0-9, Bindestrich. */
function normalizeSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function keepSecret(next: string, previous: string, clear: boolean) {
  if (clear) return "";
  const value = next.trim();
  if (!value) return previous;
  return encryptSecret(value);
}

async function requirePlatform() {
  const admin = await getPlatformAdmin();
  if (!admin) return null;
  return admin;
}

export async function platformLoginAction(
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const admin = await loginPlatformAdmin(login, password);
  if (!admin) return { error: "Anmeldung fehlgeschlagen." };
  await setPlatformSession(admin);
  redirect("/vereine");
}

export async function platformLogoutAction() {
  await clearPlatformSession();
  redirect("/vereine");
}

export async function createClubAction(
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const actor = await requirePlatform();
  if (!actor) return { error: "Bitte anmelden." };

  const name = String(formData.get("name") ?? "").trim();
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));
  const adminEmail = String(formData.get("adminEmail") ?? "").trim().toLowerCase();

  if (name.length < 2) return { error: "Bitte einen Vereinsnamen angeben." };
  if (!SLUG.test(slug)) {
    return {
      error:
        "Subdomain: nur a–z, 0–9 und Bindestrich (z. B. voellan statt völlan).",
    };
  }
  if (!adminEmail.includes("@") || adminEmail.length < 5) {
    return { error: "Bitte die E-Mail des ersten Admins angeben." };
  }

  const taken = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (taken) return { error: "Diese Subdomain ist schon vergeben." };

  let clubId = "";
  try {
    const club = await prisma.club.create({
      data: {
        name,
        slug,
        settings: {
          create: { impressumUrl: "" },
        },
      },
      select: { id: true },
    });
    clubId = club.id;

    const inviteError = await runWithClub(club.id, async () => {
      const username = await allocateUniqueUsername(
        usernameCandidateFromEmail(adminEmail),
      );
      const placeholders = incompleteProfilePlaceholders(
        randomBytes(8).toString("hex"),
      );
      const user = await prisma.user.create({
        data: {
          clubId: club.id,
          username,
          email: adminEmail,
          ...placeholders,
          passwordHash: await hash(randomBytes(32).toString("hex"), 10),
          role: "ADMIN",
          canLogin: true,
          emailVerifiedAt: null,
        },
        select: { id: true },
      });
      const issued = await issueEmailVerification(user.id, "/konto/familie", {
        clubSlug: slug,
      });
      if (!issued.sent) {
        return (
          issued.error ??
          "Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte Mail am Verein prüfen und Einladung erneut senden."
        );
      }
      return null;
    });

    if (inviteError) {
      clearClubHostCache();
      return {
        error: `Verein wurde angelegt, aber die Einladung an ${adminEmail} schlug fehl: ${inviteError}`,
      };
    }
  } catch {
    if (clubId) {
      try {
        await prisma.club.delete({ where: { id: clubId } });
      } catch {
        /* ignore cleanup */
      }
    }
    return {
      error:
        "Verein konnte nicht angelegt werden. Die E-Mail ist in diesem Verein vielleicht schon belegt.",
    };
  }

  clearClubHostCache();
  redirect("/vereine");
}

export async function resendClubAdminInviteAction(clubId: string) {
  const actor = await requirePlatform();
  if (!actor) redirect("/vereine");
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true },
  });
  if (!club) redirect("/vereine");

  const result = await runWithClub(club.id, async () => {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", canLogin: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        emailVerifyToken: true,
      },
    });
    if (!admin) return { error: "Kein Admin in diesem Verein." };
    if (admin.emailVerifiedAt && !admin.emailVerifyToken) {
      return { error: "Der Admin hat die Registrierung bereits abgeschlossen." };
    }
    const issued = await issueEmailVerification(admin.id, "/konto/familie", {
      clubSlug: club.slug,
    });
    if (!issued.sent) {
      return {
        error:
          issued.error ??
          "Bestätigungs-E-Mail konnte nicht gesendet werden.",
      };
    }
    return { ok: true as const, email: admin.email };
  });

  if ("error" in result) {
    redirect(`/vereine/${clubId}?invite=error`);
  }
  redirect(`/vereine/${clubId}?invite=sent`);
}

export async function openClubAdminAction(clubId: string) {
  const actor = await requirePlatform();
  if (!actor) redirect("/vereine");
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { slug: true, active: true },
  });
  if (!club?.active) redirect("/vereine");
  const admin = await prisma.user.findFirst({
    where: { clubId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) redirect(`/vereine/${clubId}`);
  const token = await createPlatformEnterToken({
    userId: admin.id,
    platformAdminId: actor.id,
  });
  const host = await requestHostHeader();
  // Same-Host-Vorschau auf der Plattform-URL; mit Subdomain auf {slug}.{domain}.
  // Nie Render-Bind-Adresse 0.0.0.0:10000 verwenden.
  const preferred = supportsClubSubdomains()
    ? clubPublicUrl(club.slug, host)
    : await platformBaseUrl();
  const fallbackDomain = platformDomain() || "wegaplan.onrender.com";
  const origin = isUsablePublicOrigin(preferred)
    ? preferred
    : `https://${fallbackDomain}`;
  const url = new URL("/api/platform/enter", origin);
  url.searchParams.set("token", token);
  url.searchParams.set("club", club.slug);
  redirect(url.toString());
}

export async function saveClubSettingsAction(
  clubId: string,
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const actor = await requirePlatform();
  if (!actor) return { error: "Bitte anmelden." };

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: { settings: true, hosts: true },
  });
  if (!club || !club.settings) return { error: "Verein nicht gefunden." };

  const name = String(formData.get("name") ?? "").trim();
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));
  if (name.length < 2) return { error: "Name fehlt." };
  if (!SLUG.test(slug)) {
    return {
      error:
        "Subdomain: nur a–z, 0–9 und Bindestrich (z. B. voellan statt völlan).",
    };
  }
  if (slug !== club.slug) {
    const taken = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
    if (taken) return { error: "Diese Subdomain ist schon vergeben." };
  }

  const previous = club.settings;
  const hosts = String(formData.get("hosts") ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);

  await prisma.$transaction(async (tx) => {
    await tx.club.update({
      where: { id: clubId },
      data: {
        name,
        slug,
        active: formData.get("active") === "on",
      },
    });
    await tx.clubHost.deleteMany({ where: { clubId } });
    if (hosts.length > 0) {
      await tx.clubHost.createMany({
        data: hosts.map((host) => ({ clubId, host })),
      });
    }
    await tx.clubSettings.update({
      where: { clubId },
      data: {
        configuredAt: new Date(),
        mailProvider: String(formData.get("mailProvider") ?? "").trim().toLowerCase(),
        mailFrom: String(formData.get("mailFrom") ?? "").trim(),
        brevoApiKey: keepSecret(
          String(formData.get("brevoApiKey") ?? ""),
          previous.brevoApiKey,
          formData.get("clearBrevo") === "on",
        ),
        resendApiKey: keepSecret(
          String(formData.get("resendApiKey") ?? ""),
          previous.resendApiKey,
          formData.get("clearResend") === "on",
        ),
        smtpHost: String(formData.get("smtpHost") ?? "").trim(),
        smtpPort: String(formData.get("smtpPort") ?? "").trim(),
        smtpUser: String(formData.get("smtpUser") ?? "").trim(),
        smtpPass: keepSecret(
          String(formData.get("smtpPass") ?? ""),
          previous.smtpPass,
          formData.get("clearSmtp") === "on",
        ),
        registrationBackupEmail: String(formData.get("registrationBackupEmail") ?? "").trim(),
        supportTicketNotifyEmail: String(formData.get("supportTicketNotifyEmail") ?? "").trim(),
        stripeFeePercent: String(formData.get("stripeFeePercent") ?? "").trim(),
        stripeFeeFixedCents: String(formData.get("stripeFeeFixedCents") ?? "").trim(),
        showcaseMode: formData.get("showcaseMode") === "on",
        impressumUrl: String(formData.get("impressumUrl") ?? "").trim(),
      },
    });
  });

  clearClubHostCache();
  redirect(`/vereine/${clubId}`);
}

export async function saveSectionPaymentAction(
  sectionId: string,
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const actor = await requirePlatform();
  if (!actor) return { error: "Bitte anmelden." };
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { paymentConfig: true },
  });
  if (!section) return { error: "Sektion nicht gefunden." };
  const previous = section.paymentConfig;
  await prisma.sectionPaymentConfig.upsert({
    where: { sectionId },
    create: {
      sectionId,
      bankAccountHolder: String(formData.get("bankAccountHolder") ?? "").trim(),
      bankIban: encryptSecret(String(formData.get("bankIban") ?? "")),
      stripeSecretKey: encryptSecret(String(formData.get("stripeSecretKey") ?? "")),
      stripeWebhookSecret: encryptSecret(String(formData.get("stripeWebhookSecret") ?? "")),
    },
    update: {
      bankAccountHolder: String(formData.get("bankAccountHolder") ?? "").trim(),
      bankIban: encryptSecret(String(formData.get("bankIban") ?? "")),
      stripeSecretKey: keepSecret(
        String(formData.get("stripeSecretKey") ?? ""),
        previous?.stripeSecretKey ?? "",
        formData.get("clearStripe") === "on",
      ),
      stripeWebhookSecret: keepSecret(
        String(formData.get("stripeWebhookSecret") ?? ""),
        previous?.stripeWebhookSecret ?? "",
        formData.get("clearWebhook") === "on",
      ),
    },
  });
  const { syncSectionPayoutBank } = await import("@/lib/stripe-connect");
  await syncSectionPayoutBank(sectionId).catch((error) => {
    console.error("Stripe Auszahlungskonto", sectionId, error);
  });
  redirect(`/vereine/${section.clubId}#section-${sectionId}`);
}

function stripeReturnPath(
  clubId: string,
  sectionId: string,
  code: string,
  detail?: string,
) {
  const params = new URLSearchParams({ stripe: code, section: sectionId });
  if (detail) params.set("m", detail);
  return `/vereine/${clubId}?${params.toString()}#section-${sectionId}`;
}

async function sectionClubId(sectionId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { clubId: true },
  });
  return section?.clubId ?? null;
}

export async function openSectionStripeOnboardingAction(sectionId: string) {
  const actor = await requirePlatform();
  if (!actor) redirect("/vereine");
  const clubId = await sectionClubId(sectionId);
  if (!clubId) redirect("/vereine");
  const { beginSectionStripeOnboarding } = await import("@/lib/stripe-connect");
  const result = await beginSectionStripeOnboarding(sectionId);
  if ("url" in result) redirect(result.url);
  redirect(stripeReturnPath(clubId, sectionId, result.code, result.detail));
}

export async function openSectionStripeDashboardAction(sectionId: string) {
  const actor = await requirePlatform();
  if (!actor) redirect("/vereine");
  const clubId = await sectionClubId(sectionId);
  if (!clubId) redirect("/vereine");
  const { sectionStripeDashboardLink } = await import("@/lib/stripe-connect");
  const result = await sectionStripeDashboardLink(sectionId);
  if ("url" in result) redirect(result.url);
  redirect(stripeReturnPath(clubId, sectionId, result.code, result.detail));
}

export async function refreshSectionStripeStatusAction(sectionId: string) {
  const actor = await requirePlatform();
  if (!actor) redirect("/vereine");
  const clubId = await sectionClubId(sectionId);
  if (!clubId) redirect("/vereine");
  const { refreshSectionConnectStatus } = await import("@/lib/stripe-connect");
  try {
    await refreshSectionConnectStatus(sectionId);
  } catch (error) {
    console.error("Stripe Connect Status", sectionId, error);
    redirect(
      stripeReturnPath(clubId, sectionId, "stripe", "Status konnte nicht geladen werden."),
    );
  }
  redirect(stripeReturnPath(clubId, sectionId, "zurueck"));
}
