import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isProfileComplete } from "@/lib/profile";

/** Pages reachable while Stammdaten are still incomplete. */
export function isProfileGateExemptPath(pathname: string) {
  if (pathname === "/konto/familie" || pathname.startsWith("/konto/familie/")) {
    return true;
  }
  if (pathname.startsWith("/anmelden")) return true;
  if (pathname.startsWith("/registrieren")) return true;
  if (pathname.startsWith("/bestaetigen")) return true;
  if (pathname.startsWith("/passwort-vergessen")) return true;
  if (pathname.startsWith("/passwort-zuruecksetzen")) return true;
  if (pathname.startsWith("/datenschutz")) return true;
  if (pathname.startsWith("/api/")) return true;
  return false;
}

export async function isUserProfileComplete(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      phone: true,
      taxId: true,
      street: true,
      postalCode: true,
      city: true,
      birthDate: true,
      email: true,
      canLogin: true,
    },
  });
  if (!user) return false;
  return isProfileComplete(user);
}

export async function getRequestPathname() {
  const headerList = await headers();
  return (
    headerList.get("x-pathname") ??
    headerList.get("x-invoke-path") ??
    headerList.get("next-url") ??
    "/"
  );
}

/** Returns whether Stammdaten are complete; redirects away from locked pages if not. */
export async function resolveProfileGate(userId: string) {
  const complete = await isUserProfileComplete(userId);
  if (complete) return true;
  const pathname = await getRequestPathname();
  if (!isProfileGateExemptPath(pathname)) {
    redirect("/konto/familie");
  }
  return false;
}
