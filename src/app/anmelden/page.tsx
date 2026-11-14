import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { DemoLogins } from "@/components/demo-logins";
import { getCurrentUser } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n";
import { getLoggedInHomePath } from "@/lib/membership";
import { isUserProfileComplete } from "@/lib/profile-gate";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("auth.loginTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { t } = await getServerI18n();
  const { next } = await searchParams;
  const nextPath =
    next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const user = await getCurrentUser();
  if (user) {
    if (!(await isUserProfileComplete(user.id))) {
      redirect("/konto/familie");
    }
    if (nextPath !== "/") {
      redirect(nextPath);
    }
    redirect(await getLoggedInHomePath(user.id));
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-start">
      <div>
        <h1 className="text-4xl">{t("auth.loginTitle")}</h1>
        <p className="mt-2 mb-8 text-sm text-muted-foreground">
          {t("auth.loginDesc")}
        </p>
        <AuthForm mode="login" nextPath={nextPath} />
      </div>
      <DemoLogins t={t} />
    </div>
  );
}
