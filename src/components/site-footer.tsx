"use client";

import Link from "next/link";
import { ClubLogo } from "@/components/club-logo";
import { useI18n } from "@/components/locale-provider";

export function SiteFooter({
  reserveTabBar = false,
}: {
  reserveTabBar?: boolean;
}) {
  const { t } = useI18n();

  return (
    <footer className="border-t border-border bg-[#151515] text-[#f8f8f8]">
      <div className="mx-auto hidden w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 md:flex">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-white p-1.5">
            <ClubLogo variant="icon" href={null} className="size-10" />
          </span>
          <div>
            <p className="font-heading font-semibold text-white">
              ASC Lajen Raiffeisen
            </p>
            <p className="text-white/70">{t("nav.footerClub")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-white/70">{t("nav.footerServices")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/datenschutz"
              className="text-white/80 underline-offset-4 hover:text-white hover:underline"
            >
              {t("nav.privacy")}
            </Link>
            <a
              href="https://asclajen.com/impressum"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 underline-offset-4 hover:text-white hover:underline"
            >
              {t("nav.impressum")}
            </a>
          </div>
        </div>
      </div>
      <p
        className={
          reserveTabBar
            ? "border-t border-white/10 py-3 text-center text-xs text-white/50 pb-[calc(1rem+4.5rem+env(safe-area-inset-bottom,0px))] md:pb-3"
            : "border-t border-white/10 py-3 text-center text-xs text-white/50"
        }
      >
        Powered by Fabian Gasser
      </p>
    </footer>
  );
}
