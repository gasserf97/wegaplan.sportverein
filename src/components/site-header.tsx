"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ClubLogo } from "@/components/club-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PwaInstallMenuItem } from "@/components/pwa-install-menu-item";
import { useI18n } from "@/components/locale-provider";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function NavLinks({
  user,
  showAdmin,
  showFleet,
  linkClass,
  LinkComponent = Link,
  showPwaInstall = false,
  onPwaInstallSelect,
}: {
  user: SessionUser | null;
  showAdmin?: boolean;
  showFleet?: boolean;
  linkClass: string;
  LinkComponent?: React.ElementType;
  showPwaInstall?: boolean;
  onPwaInstallSelect?: () => void;
}) {
  const { t } = useI18n();
  const Item = LinkComponent;
  return (
    <>
      <Item href="/kurse" className={linkClass}>
        {t("nav.courses")}
      </Item>
      <Item href="/abos" className={linkClass}>
        {t("nav.subscriptions")}
      </Item>
      <Item href="/tennisplatz" className={linkClass}>
        {t("nav.tennis")}
      </Item>
      {user && showFleet ? (
        <Item href="/autos" className={linkClass}>
          {t("nav.autos")}
        </Item>
      ) : null}
      {user ? (
        <>
          <Item href="/konto" className={linkClass}>
            {t("nav.account")}
          </Item>
          <Item href="/konto/familie" className={linkClass}>
            <span className="md:hidden">{t("nav.family")}</span>
            <span className="hidden md:inline">{t("nav.familyShort")}</span>
          </Item>
          {showPwaInstall ? (
            <PwaInstallMenuItem
              className={linkClass}
              onSelect={onPwaInstallSelect}
            />
          ) : null}
        </>
      ) : null}
      {showAdmin ? (
        <Item href="/admin" className={linkClass}>
          {t("nav.admin")}
        </Item>
      ) : null}
    </>
  );
}

function MobileNavLink({
  href,
  className,
  children,
  external = false,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <SheetClose
      nativeButton={false}
      render={
        external ? (
          <a href={href} target="_blank" rel="noopener noreferrer" />
        ) : (
          <Link href={href} />
        )
      }
      className={className}
    >
      {children}
    </SheetClose>
  );
}

export function SiteHeader({
  user,
  showAdmin = false,
  showFleet = false,
  homeHref = "/",
  lockNavigation = false,
}: {
  user: SessionUser | null;
  showAdmin?: boolean;
  showFleet?: boolean;
  homeHref?: string;
  lockNavigation?: boolean;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const linkClass =
    "whitespace-nowrap text-sm font-medium text-foreground/80 transition-colors hover:text-primary";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[#f8f8f8]/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:gap-4">
        <Link
          href={homeHref}
          className="flex shrink-0 items-center gap-2 sm:gap-3"
          aria-label="ASC Lajen Raiffeisen"
        >
          <ClubLogo variant="icon" href={null} priority />
          <ClubLogo
            variant="wordmark"
            href={null}
            priority
            className="hidden h-8 lg:block lg:h-9"
          />
        </Link>

        {!lockNavigation ? (
          <nav className="ml-auto hidden min-w-0 items-center gap-3 md:flex lg:gap-5">
            <NavLinks
              user={user}
              showAdmin={showAdmin}
              showFleet={showFleet}
              linkClass={linkClass}
            />
          </nav>
        ) : (
          <div className="ml-auto hidden md:block" />
        )}

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <LanguageSwitcher />
          {user ? (
            <>
              <span className="hidden max-w-28 truncate text-sm text-muted-foreground xl:inline">
                {user.name}
              </span>
              <form action={logoutAction}>
                <Button type="submit" variant="outline" size="sm">
                  {t("nav.logout")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/anmelden" className={buttonLink("ghost")}>
                {t("nav.login")}
              </Link>
              <Link href="/registrieren" className={buttonLink("default")}>
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
          <LanguageSwitcher />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen} disablePointerDismissal={false}>
            <SheetTrigger
              nativeButton={false}
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1.5 size-10 shrink-0 md:hidden"
                />
              }
            >
              <MenuIcon className="size-5" />
              <span className="sr-only">{t("nav.openMenu")}</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="sr-only">ASC Lajen</SheetTitle>
                <ClubLogo variant="wordmark" href={null} className="h-8" />
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-6">
                {user ? (
                  <p className="text-sm text-muted-foreground">
                    {t("nav.loggedInAs", { name: user.name })}
                  </p>
                ) : null}
                {lockNavigation ? (
                  <p className="text-sm text-muted-foreground">
                    {t("account.familyNavLocked")}
                  </p>
                ) : (
                  <nav className="flex flex-col gap-4">
                    <NavLinks
                      user={user}
                      showAdmin={showAdmin}
                      showFleet={showFleet}
                      linkClass={linkClass}
                      LinkComponent={MobileNavLink}
                      showPwaInstall
                      onPwaInstallSelect={() => setMenuOpen(false)}
                    />
                    <MobileNavLink href="/datenschutz" className={linkClass}>
                      {t("nav.privacy")}
                    </MobileNavLink>
                    <MobileNavLink
                      href="https://asclajen.com/impressum"
                      className={linkClass}
                      external
                    >
                      {t("nav.impressum")}
                    </MobileNavLink>
                  </nav>
                )}
                {user ? (
                  <form action={logoutAction}>
                    <Button type="submit" variant="outline" className="w-full">
                      {t("nav.logout")}
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2">
                    <SheetClose
                      nativeButton={false}
                      render={<Link href="/anmelden" />}
                      className={buttonLink("outline") + " w-full"}
                    >
                      {t("nav.login")}
                    </SheetClose>
                    <SheetClose
                      nativeButton={false}
                      render={<Link href="/registrieren" />}
                      className={buttonLink("default") + " w-full"}
                    >
                      {t("nav.register")}
                    </SheetClose>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function buttonLink(variant: "default" | "ghost" | "outline") {
  const base =
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-sm font-medium";
  if (variant === "default") {
    return `${base} bg-primary text-primary-foreground hover:bg-primary/90`;
  }
  if (variant === "outline") {
    return `${base} border border-border bg-background hover:bg-muted`;
  }
  return `${base} hover:bg-muted hover:text-primary`;
}
