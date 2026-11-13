import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/set-password-form";
import {
  lookupVerifyToken,
  normalizeVerifyToken,
} from "@/lib/email-verification";
import { displayUserEmail } from "@/lib/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Passwort festlegen",
};

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/konto/familie";
  }
  return value;
}

function InvalidLink({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Mit derselben E-Mail erneut registrieren – Sie erhalten einen neuen
        Link.
      </p>
      <Link href="/registrieren" className="mt-6 inline-block text-sm underline">
        Erneut registrieren
      </Link>
    </div>
  );
}

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token: rawToken, next } = await searchParams;
  const token = normalizeVerifyToken(rawToken);
  const nextPath = safeNextPath(next);

  if (!token) {
    return (
      <InvalidLink
        title="Link ungültig"
        body="Es fehlt ein gültiger Bestätigungslink. Bitte registrieren Sie sich erneut oder fordern Sie eine neue Einladung an."
      />
    );
  }

  const result = await lookupVerifyToken(token);
  if (result.status === "expired") {
    return (
      <InvalidLink
        title="Link abgelaufen"
        body="Dieser Link ist abgelaufen (gültig 48 Stunden). Bitte erneut registrieren oder eine neue Einladungs-E-Mail anfordern."
      />
    );
  }
  if (result.status === "missing") {
    return (
      <InvalidLink
        title="Link ungültig"
        body="Dieser Link ist ungültig. Bitte erneut registrieren – mit derselben E-Mail erhalten Sie einen neuen Link."
      />
    );
  }

  const user = result.user;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-4xl">Passwort festlegen</h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">
        E-Mail bestätigt. Legen Sie jetzt Ihr Passwort fest, um fortzufahren.
      </p>
      <SetPasswordForm
        token={token}
        nextPath={nextPath}
        email={displayUserEmail(user.email) || user.email}
      />
    </div>
  );
}
