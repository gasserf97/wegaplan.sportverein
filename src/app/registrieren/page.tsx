import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n";

const AFTER_REGISTER_PATH = "/konto/familie";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("auth.registerTitle") };
}

export default async function RegisterPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (user) redirect(AFTER_REGISTER_PATH);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-4xl">{t("auth.registerTitle")}</h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">
        {t("auth.registerDesc")}
      </p>
      <AuthForm mode="register" nextPath={AFTER_REGISTER_PATH} />
    </div>
  );
}
