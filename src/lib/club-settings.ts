import { decryptSecret } from "@/lib/club-secrets";
import { prisma } from "@/lib/prisma";
import { currentClubId, isLegacyClub } from "@/lib/tenant";

export type ClubWithSettings = NonNullable<
  Awaited<ReturnType<typeof loadClubRecord>>
>;

async function loadClubRecord(clubId: string) {
  return prisma.club.findUnique({
    where: { id: clubId },
    include: { settings: true },
  });
}

export async function getCurrentClubRecord() {
  const clubId = await currentClubId();
  if (!clubId) return null;
  return loadClubRecord(clubId);
}

export function usesLegacyEnv(club: { slug: string; settings: { configuredAt: Date | null } | null }) {
  return isLegacyClub(club.slug) && !club.settings?.configuredAt;
}

export type MailEnvOverlay = {
  MAIL_PROVIDER: string;
  MAIL_FROM: string;
  BREVO_API_KEY: string;
  RESEND_API_KEY: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
};

function clubMailConfigured(settings: {
  mailProvider: string;
  brevoApiKey: string;
  resendApiKey: string;
  smtpHost: string;
} | null) {
  if (!settings) return false;
  const provider = settings.mailProvider.trim().toLowerCase();
  if (!provider) return false;
  if (provider === "brevo") return Boolean(decryptSecret(settings.brevoApiKey));
  if (provider === "resend") return Boolean(decryptSecret(settings.resendApiKey));
  if (provider === "smtp") return Boolean(settings.smtpHost.trim());
  return false;
}

/** null = Prozess-Umgebung nutzen (Legacy, kein Verein, oder Mail noch nicht am Verein). */
export async function mailEnvOverlay(): Promise<MailEnvOverlay | null> {
  const club = await getCurrentClubRecord();
  if (!club) return null;
  if (usesLegacyEnv(club)) return null;
  const settings = club.settings;
  if (!clubMailConfigured(settings)) return null;
  return {
    MAIL_PROVIDER: settings?.mailProvider ?? "",
    MAIL_FROM: settings?.mailFrom ?? "",
    BREVO_API_KEY: decryptSecret(settings?.brevoApiKey ?? ""),
    RESEND_API_KEY: decryptSecret(settings?.resendApiKey ?? ""),
    SMTP_HOST: settings?.smtpHost ?? "",
    SMTP_PORT: settings?.smtpPort ?? "",
    SMTP_USER: settings?.smtpUser ?? "",
    SMTP_PASS: decryptSecret(settings?.smtpPass ?? ""),
  };
}

export async function registrationBackupEmailSetting() {
  const club = await getCurrentClubRecord();
  if (!club) return null;
  if (usesLegacyEnv(club)) return null;
  return club.settings?.registrationBackupEmail?.trim() ?? "";
}

export async function supportNotifyEmailSetting() {
  const club = await getCurrentClubRecord();
  if (!club) return process.env.SUPPORT_TICKET_NOTIFY_EMAIL?.trim() || "";
  if (usesLegacyEnv(club)) {
    return process.env.SUPPORT_TICKET_NOTIFY_EMAIL?.trim() || "fabian@wegaplan.com";
  }
  return club.settings?.supportTicketNotifyEmail?.trim() ?? "";
}

export async function stripeFeeSetting(): Promise<{
  percent: string | null;
  fixedCents: string | null;
}> {
  const club = await getCurrentClubRecord();
  if (!club || usesLegacyEnv(club)) {
    return { percent: null, fixedCents: null };
  }
  return {
    percent: club.settings?.stripeFeePercent?.trim() || null,
    fixedCents: club.settings?.stripeFeeFixedCents?.trim() || null,
  };
}

export async function clubShowcaseMode(): Promise<boolean | null> {
  const club = await getCurrentClubRecord();
  if (!club || usesLegacyEnv(club)) return null;
  return Boolean(club.settings?.showcaseMode);
}

export async function clubImpressumUrl() {
  const club = await getCurrentClubRecord();
  if (!club) return "";
  const saved = club.settings?.impressumUrl?.trim() ?? "";
  if (saved) return saved;
  if (isLegacyClub(club.slug)) return "https://asclajen.com/impressum";
  return "";
}

export async function clubDisplayName() {
  const club = await getCurrentClubRecord();
  return club?.name?.trim() || "Sportverein";
}
