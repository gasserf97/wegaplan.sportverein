import Link from "next/link";
import { headers } from "next/headers";
import { HostingHealthBanner } from "@/components/hosting-health-banner";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";

export default async function VereineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) return children;

  const path = (await headers()).get("x-pathname") ?? "";
  const ticketsActive = path.startsWith("/vereine/tickets");
  const hostingActive = path.startsWith("/vereine/hosting");
  const clubsActive =
    path.startsWith("/vereine") && !ticketsActive && !hostingActive;
  const openForwards = await prisma.supportTicket.count({
    where: { forwardedAt: { not: null }, platformStatus: "OPEN" },
  });

  return (
    <div>
      <nav className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl gap-2 px-4 py-3">
          <PlatformNavLink href="/vereine" active={clubsActive}>
            Vereine
          </PlatformNavLink>
          <PlatformNavLink href="/vereine/tickets" active={ticketsActive}>
            Tickets
            {openForwards > 0 ? (
              <span
                className={
                  ticketsActive
                    ? "ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1.5 text-xs text-primary"
                    : "ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
                }
              >
                {openForwards}
              </span>
            ) : null}
          </PlatformNavLink>
          <PlatformNavLink href="/vereine/hosting" active={hostingActive}>
            Hosting
          </PlatformNavLink>
        </div>
      </nav>
      <HostingHealthBanner />
      {children}
    </div>
  );
}

function PlatformNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground"
          : "inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      }
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
