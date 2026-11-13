"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  HomeIcon,
  IdCardIcon,
  UserIcon,
} from "lucide-react";
import { TennisRacketIcon } from "@/components/icons/tennis-racket-icon";
import { useI18n } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

const hiddenPrefixes = [
  "/anmelden",
  "/registrieren",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/admin",
  "/zahlung",
];

export function MobileTabBar({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const guestTabs = [
    {
      href: "/",
      label: t("nav.tabStart"),
      icon: HomeIcon,
      active: (path: string) => path === "/",
    },
    {
      href: "/abos",
      label: t("nav.tabSubscriptions"),
      icon: IdCardIcon,
      active: (path: string) => path.startsWith("/abos"),
    },
    {
      href: "/tennisplatz",
      label: t("nav.tabTennis"),
      icon: TennisRacketIcon,
      active: (path: string) => path.startsWith("/tennisplatz"),
    },
    {
      href: "/kurse",
      label: t("nav.tabCourses"),
      icon: CalendarDaysIcon,
      active: (path: string) => path.startsWith("/kurse"),
    },
    {
      href: "/konto",
      label: t("nav.tabAccount"),
      icon: UserIcon,
      active: (path: string) => path.startsWith("/konto"),
    },
  ] as const;

  const memberTabs = [
    {
      href: "/abos",
      label: t("nav.tabSubscriptions"),
      icon: IdCardIcon,
      active: (path: string) => path.startsWith("/abos"),
    },
    {
      href: "/tennisplatz",
      label: t("nav.tabTennis"),
      icon: TennisRacketIcon,
      active: (path: string) => path.startsWith("/tennisplatz"),
    },
    {
      href: "/kurse",
      label: t("nav.tabCourses"),
      icon: CalendarDaysIcon,
      active: (path: string) => path.startsWith("/kurse"),
    },
    {
      href: "/konto",
      label: t("nav.tabAccount"),
      icon: UserIcon,
      active: (path: string) => path.startsWith("/konto"),
    },
  ] as const;

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const tabs = isLoggedIn ? memberTabs : guestTabs;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
      aria-label={t("nav.mainNavAria")}
    >
      <ul
        className={cn(
          "mx-auto grid max-w-lg",
          isLoggedIn ? "grid-cols-4" : "grid-cols-5",
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.active(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.65rem] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5", isActive && "stroke-[2.5]")} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
