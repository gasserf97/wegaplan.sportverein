import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { getServerI18n } from "@/lib/i18n";
import { lookupPasswordResetToken } from "@/lib/password-reset";
import { PASSWORD_RESET_HOURS } from "@/lib/password-reset-config";
import { normalizeVerifyToken } from "@/lib/email-verification";
import { displayUserEmail } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("auth.resetPasswordTitle") };
}

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function InvalidResetLink({
  title,
  body,
  requestLabel,
  nextPath,
}: {
  title: string;
  body: string;
  requestLabel: string;
  nextPath: string;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      <Link
        href={`/passwort-vergessen?next=${encodeURIComponent(nextPath)}`}
        className="mt-6 inline-block text-sm underline"
      >
        {requestLabel}
      </Link>
    </div>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { t } = await getServerI18n();
  const { token: rawToken, next } = await searchParams;
  const token = normalizeVerifyToken(rawToken);
  const nextPath = safeNextPath(next);
  const requestLabel = t("auth.requestNewLink");

  if (!token) {
    return (
      <InvalidResetLink
        title={t("auth.resetLinkInvalidTitle")}
        body={t("auth.resetLinkInvalidBody")}
        requestLabel={requestLabel}
        nextPath={nextPath}
      />
    );
  }

  const result = await lookupPasswordResetToken(token);
  if (result.status === "expired") {
    return (
      <InvalidResetLink
        title={t("auth.resetLinkExpiredTitle")}
        body={t("auth.resetLinkExpiredBody", { hours: PASSWORD_RESET_HOURS })}
        requestLabel={requestLabel}
        nextPath={nextPath}
      />
    );
  }
  if (result.status === "used") {
    return (
      <InvalidResetLink
        title={t("auth.resetLinkUsedTitle")}
        body={t("auth.resetLinkUsedBody")}
        requestLabel={requestLabel}
        nextPath={nextPath}
      />
    );
  }
  if (result.status === "missing") {
    return (
      <InvalidResetLink
        title={t("auth.resetLinkInvalidTitle")}
        body={t("auth.resetLinkInvalidBody")}
        requestLabel={requestLabel}
        nextPath={nextPath}
      />
    );
  }

  const email = displayUserEmail(result.user.email) || result.user.email;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-4xl">{t("auth.resetPasswordTitle")}</h1>
      <div className="mt-8">
        <ResetPasswordForm token={token} nextPath={nextPath} email={email} />
      </div>
    </div>
  );
}
