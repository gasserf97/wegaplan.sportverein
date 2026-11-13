import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { bankTransferDetailsForSection } from "@/lib/bank-transfer";
import { canActFor } from "@/lib/family";
import { formatEuro } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("payment.transferTitle") };
}

export default async function BankTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  const { ref } = await searchParams;
  if (!ref) notFound();

  const [enrollments, subscriptions] = await Promise.all([
    prisma.enrollment.findMany({
      where: { paymentReference: ref, paymentMethod: "BANK_TRANSFER" },
      include: {
        course: true,
        user: { select: { name: true } },
      },
    }),
    prisma.subscription.findMany({
      where: { paymentReference: ref, paymentMethod: "BANK_TRANSFER" },
      include: {
        plan: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  if (enrollments.length === 0 && subscriptions.length === 0) notFound();

  const sectionId =
    enrollments[0]?.course.sectionId ?? subscriptions[0]?.plan.sectionId ?? null;
  const bank = await bankTransferDetailsForSection(sectionId);
  if (!bank) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <h1 className="text-4xl">{t("payment.transferTitle")}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("payment.noBankDetails")}
        </p>
        <Link href="/konto" className="mt-6 inline-block text-sm underline">
          {t("payment.toAccount")}
        </Link>
      </div>
    );
  }

  const allowed = await Promise.all([
    ...enrollments.map(async (item) =>
      (await canActFor(user.id, item.userId)) ||
      item.purchasedById === user.id ||
      user.role === "ADMIN",
    ),
    ...subscriptions.map(async (item) =>
      (await canActFor(user.id, item.userId)) ||
      item.purchasedById === user.id ||
      user.role === "ADMIN",
    ),
  ]);
  if (!allowed.every(Boolean)) notFound();

  const totalCents =
    enrollments.reduce((sum, item) => {
      const paid = item.paidCents ?? item.course.priceCents;
      return (
        sum +
        externalPaymentDueCents(
          paid,
          item.course.priceCents,
          item.creditAppliedCents,
          item.status === "PENDING",
        )
      );
    }, 0) +
    subscriptions.reduce((sum, item) => {
      const paid = item.paidCents ?? item.plan.priceCents;
      return (
        sum +
        externalPaymentDueCents(
          paid,
          item.plan.priceCents,
          item.creditAppliedCents,
          item.status === "PENDING",
        )
      );
    }, 0);

  const creditUsedCents =
    enrollments.reduce((sum, item) => sum + item.creditAppliedCents, 0) +
    subscriptions.reduce((sum, item) => sum + item.creditAppliedCents, 0);

  const pending =
    enrollments.some((item) => item.status === "PENDING") ||
    subscriptions.some((item) => item.status === "PENDING");
  const hasCourseEnrollment = enrollments.length > 0;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
      <h1 className="text-4xl">{t("payment.transferTitle")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {t("payment.transferInstructions")}
      </p>

      {hasCourseEnrollment ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          {t("payment.transferCourseHoldNotice")}
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">{t("payment.toPay")}</p>
        <p className="font-heading text-4xl">
          {totalCents === 0 ? t("common.free") : formatEuro(totalCents, locale)}
        </p>
        {creditUsedCents > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("payment.creditNote", {
              amount: formatEuro(creditUsedCents, locale),
            })}
          </p>
        ) : null}

        <dl className="mt-6 grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("payment.recipient")}</dt>
            <dd className="font-medium">{bank.holder}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("payment.iban")}</dt>
            <dd className="font-mono text-base tracking-wide">{bank.formattedIban}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("payment.reference")}</dt>
            <dd className="font-mono text-base font-semibold">{ref}</dd>
          </div>
        </dl>

        <ul className="mt-6 grid gap-2 border-t border-border pt-4 text-sm">
          {enrollments.map((item) => (
            <li key={item.id}>
              {item.course.title} – {item.user.name}
            </li>
          ))}
          {subscriptions.map((item) => (
            <li key={item.id}>
              {item.plan.title} – {item.user.name}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-muted-foreground">
          {pending ? t("payment.statusPending") : t("payment.statusSuccess")}
        </p>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/konto" className="underline">
          {t("payment.toAccount")}
        </Link>
      </p>
    </div>
  );
}
