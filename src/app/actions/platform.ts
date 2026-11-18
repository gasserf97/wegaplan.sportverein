"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { encryptSecret } from "@/lib/club-secrets";
import {
  clearPlatformSession,
  createPlatformEnterToken,
  getPlatformAdmin,
  loginPlatformAdmin,
  setPlatformSession,
} from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { supportsClubSubdomains } from "@/lib/host";
import {
  clearClubHostCache,
  clubPublicUrl,
  platformBaseUrl,
  requestHostHeader,
} from "@/lib/tenant";

export type PlatformState = { error: string } | null;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

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
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const adminName = String(formData.get("adminName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim().toLowerCase();
  const adminUsername = String(formData.get("adminUsername") ?? "").trim().toLowerCase();
  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (name.length < 2) return { error: "Bitte einen Vereinsnamen angeben." };
  if (!SLUG.test(slug)) {
    return { error: "Subdomain: Kleinbuchstaben, Zahlen und Bindestrich." };
  }
  if (adminName.length < 2 || !adminEmail.includes("@") || adminUsername.length < 3) {
    return { error: "Bitte den ersten Admin vollständig angeben." };
  }
  if (adminPassword.length < 8) return { error: "Passwort mindestens 8 Zeichen." };

  const taken = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (taken) return { error: "Diese Subdomain ist schon vergeben." };

  try {
    await prisma.club.create({
      data: {
        name,
        slug,
        settings: {
          create: { configuredAt: new Date(), impressumUrl: "" },
        },
        users: {
          create: {
            username: adminUsername,
            name: adminName,
            email: adminEmail,
            phone: "",
            taxId: `pending-${slug}`,
            birthDate: new Date("1990-01-01T12:00:00.000Z"),
            passwordHash: await hash(adminPassword, 10),
            role: "ADMIN",
            emailVerifiedAt: new Date(),
            canLogin: true,
          },
        },
      },
    });
  } catch {
    return { error: "Verein konnte nicht angelegt werden. Benutzername oder E-Mail ist in diesem Verein schon belegt." };
  }

  clearClubHostCache();
  redirect("/vereine");
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
  const base = supportsClubSubdomains()
    ? clubPublicUrl(club.slug, host)
    : await platformBaseUrl();
  const url = new URL("/api/platform/enter", base);
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
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (name.length < 2) return { error: "Name fehlt." };
  if (!SLUG.test(slug)) return { error: "Subdomain ungültig." };
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
      bankIban: keepSecret(
        String(formData.get("bankIban") ?? ""),
        previous?.bankIban ?? "",
        formData.get("clearIban") === "on",
      ),
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
  redirect(`/vereine/${section.clubId}`);
}
