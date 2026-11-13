import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { CheckoutSuccessCleanup } from "@/components/court-checkout-cleanup";
import {
  abandonPendingCourseCheckout,
  abandonPendingCourtCheckout,
  abandonPendingDeviceCheckout,
  abandonPendingSubscriptionCheckout,
} from "@/lib/abandon-checkout";
import { getServerI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("payment.cancelTitle") };
}

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{
    kurs?: string;
    abo?: string;
    reservation?: string;
    geraet?: string;
  }>;
}) {
  const { t } = await getServerI18n();
  const { kurs, abo, reservation, geraet } = await searchParams;

  // Cleanup nach der Antwort – nicht während des Renders (sonst 500 durch
  // revalidatePath / lange Stripe-Calls beim Zurück von Checkout).
  after(async () => {
    try {
      if (reservation) await abandonPendingCourtCheckout(reservation);
      if (geraet) await abandonPendingDeviceCheckout(geraet);
      if (kurs) await abandonPendingCourseCheckout(kurs);
      if (abo) await abandonPendingSubscriptionCheckout(abo);
    } catch (error) {
      console.error("Checkout-Abbruch Cleanup", error);
    }
  });

  const course = kurs
    ? await prisma.course.findUnique({ where: { id: kurs } })
    : null;
  const plan = abo
    ? await prisma.subscriptionPlan.findUnique({ where: { id: abo } })
    : null;
  const item = plan ?? course;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
      <CheckoutSuccessCleanup />
      <h1 className="text-4xl">{t("payment.cancelTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("payment.cancelMessage")}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {geraet ? (
          <Link
            href="/autos"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.cancelBackAutos")}
          </Link>
        ) : reservation ? (
          <Link
            href="/tennisplatz"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.cancelBackTennis")}
          </Link>
        ) : item ? (
          <Link
            href={plan ? `/abos/${plan.id}` : `/kurse/${course!.id}`}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.cancelBackTitle", { title: item.title })}
          </Link>
        ) : (
          <Link
            href="/kurse"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.cancelCatalog")}
          </Link>
        )}
      </div>
    </div>
  );
}
