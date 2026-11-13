"use client";

import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { shouldShowMembershipNotices } from "@/lib/membership-notices";

export function MembershipBanner({ href }: { href: string }) {
  const { t } = useI18n();
  if (!shouldShowMembershipNotices()) return null;

  return (
    <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
      <TriangleAlertIcon
        className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0">
        <p>
          <strong className="font-semibold">{t("common.step1")}</strong>{" "}
          {t("errors.membership.bannerBefore")}{" "}
          <Link
            href={href}
            className="font-semibold text-primary underline underline-offset-4 hover:text-primary/90"
          >
            {t("common.membership")}
          </Link>{" "}
          {t("errors.membership.bannerAfter")}
        </p>
      </div>
    </div>
  );
}

export function MembershipRequired({
  href,
  nextLabel,
}: {
  href: string;
  nextLabel: string;
}) {
  const { t } = useI18n();
  if (!shouldShowMembershipNotices()) return null;

  return (
    <div
      role="alert"
      className="grid gap-4 rounded-xl border border-amber-500/50 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50"
    >
      <div className="flex gap-3">
        <TriangleAlertIcon
          className="mt-0.5 size-6 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 grid gap-1.5">
          <p className="font-semibold leading-snug">
            {t("errors.membership.requiredTitle")}
          </p>
          <p className="text-sm leading-6">
            {t("errors.membership.completeFirst", { nextLabel })}
          </p>
        </div>
      </div>
      <Button
        nativeButton={false}
        render={<Link href={href} />}
        size="lg"
        className="w-full sm:w-auto"
      >
        {t("home.ctaMembership")}
      </Button>
    </div>
  );
}
