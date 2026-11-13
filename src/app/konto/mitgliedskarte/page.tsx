import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MembershipCardView,
  toCardData,
} from "@/components/membership-card-view";
import { PrintMembershipCardButton } from "@/components/print-membership-card-button";
import { ResendMembershipCardButton } from "@/components/resend-membership-card-button";
import { getCurrentUser } from "@/lib/auth";
import { listFamily } from "@/lib/family";
import { getServerI18n } from "@/lib/i18n";
import { isMailConfigured, mailConfigIssue } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("account.membershipCard") };
}

export default async function MembershipCardPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/konto/mitgliedskarte");

  const family = await listFamily(user.id);
  const mailReady = isMailConfigured();
  const mailIssue = mailConfigIssue();
  const cards = await prisma.subscription.findMany({
    where: {
      userId: { in: family.map((person) => person.id) },
      status: { in: ["ACTIVE", "SCHEDULED"] },
      plan: { kind: "MEMBERSHIP" },
      OR: [{ periodEnd: null }, { periodEnd: { gte: new Date() } }],
    },
    include: {
      plan: { select: { title: true, confirmationTitle: true, interval: true } },
      user: { select: { id: true, name: true, username: true, birthDate: true } },
    },
    orderBy: { periodEnd: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase print:hidden">
        {t("account.membershipCardEyebrow")}
      </p>
      <h1 className="mt-2 text-4xl print:text-2xl">{t("account.membershipCard")}</h1>
      <p className="mt-3 max-w-xl text-muted-foreground print:hidden">
        {t("account.membershipCardDesc")}
      </p>
      {!mailReady && user.role === "ADMIN" && mailIssue ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
          {mailIssue}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3 print:hidden">
        {cards.length > 0 ? <PrintMembershipCardButton /> : null}
        <Link href="/konto" className="inline-flex h-9 items-center text-sm underline">
          {t("account.familyBack")}
        </Link>
      </div>

      {cards.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-8 text-muted-foreground">
          {t("account.noActiveMembership")}
        </p>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 print:grid-cols-1 print:gap-8">
          {cards.map((item) => (
            <li key={item.id} className="print:break-inside-avoid space-y-3">
              <MembershipCardView
                data={toCardData({
                  userId: item.user.id,
                  name: item.user.name,
                  birthDate: item.user.birthDate,
                  planTitle: item.plan.title,
                  confirmationTitle: item.plan.confirmationTitle,
                  periodStart: item.periodStart,
                  periodEnd: item.periodEnd,
                  interval: item.plan.interval,
                })}
              />
              <ResendMembershipCardButton subscriptionId={item.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
