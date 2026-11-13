import type { Metadata, Viewport } from "next";
import { Geist, Montserrat } from "next/font/google";
import { getCurrentUser, getImpersonationContext } from "@/lib/auth";
import { SESSION_REFRESH_AFTER_SECONDS } from "@/lib/session-token";
import { getLocale } from "@/lib/i18n/locale";
import { localeToIntlTag } from "@/lib/i18n/intl";
import { getServerI18n } from "@/lib/i18n";
import { getLoggedInHomePath } from "@/lib/membership";
import { canAccessCourseAdmin, canBookFleetDevices } from "@/lib/permissions";
import {
  resolveProfileGate,
} from "@/lib/profile-gate";
import { LocaleProvider } from "@/components/locale-provider";
import { ClubEventBanner } from "@/components/club-event-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { ClientChannelCookie } from "@/components/client-channel-cookie";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { SupportTicketButton } from "@/components/support-ticket-button";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#e40000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return {
    title: {
      default: "ASC Lajen",
      template: "%s · ASC Lajen",
    },
    description: t("home.metaDescription"),
    applicationName: "ASC Lajen",
    appleWebApp: {
      capable: true,
      title: "ASC Lajen",
      statusBarStyle: "default",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const profileComplete = user ? await resolveProfileGate(user.id) : true;
  const lockNavigation = Boolean(user && !profileComplete);

  const impersonation = await getImpersonationContext();
  const locale = await getLocale();
  const homeHref = lockNavigation
    ? "/konto/familie"
    : user
      ? await getLoggedInHomePath(user.id)
      : "/";
  const showAdmin =
    user !== null &&
    !lockNavigation &&
    (user.role === "ADMIN" || (await canAccessCourseAdmin(user)));
  const showFleet =
    user !== null &&
    !lockNavigation &&
    (await canBookFleetDevices(user));

  return (
    <html
      lang={localeToIntlTag(locale)}
      className={`${geistSans.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <LocaleProvider locale={locale}>
          <ThemeProvider>
            <SiteHeader
              user={user}
              showAdmin={showAdmin}
              showFleet={showFleet}
              homeHref={homeHref}
              lockNavigation={lockNavigation}
            />
            {impersonation ? (
              <ImpersonationBanner targetName={impersonation.targetName} />
            ) : null}
            {user ? <ClubEventBanner userId={user.id} /> : null}
            <main className="flex-1">
              {children}
            </main>
            <SiteFooter reserveTabBar={!lockNavigation} />
            {!lockNavigation ? (
              <MobileTabBar isLoggedIn={Boolean(user)} />
            ) : null}
            {!lockNavigation ? (
              <SupportTicketButton isLoggedIn={Boolean(user)} />
            ) : null}
            <ClientChannelCookie />
            <PwaInstallPrompt isLoggedIn={Boolean(user)} />
            {user ? (
              <SessionKeepAlive
                refreshAfterMs={SESSION_REFRESH_AFTER_SECONDS * 1000}
              />
            ) : null}
            <Toaster />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
