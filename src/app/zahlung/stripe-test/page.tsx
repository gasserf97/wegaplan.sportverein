import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { confirmShowcasePaymentAction } from "@/app/actions/stripe-demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerI18n } from "@/lib/i18n";
import { isStripeDemoMode } from "@/lib/stripe";
import { loadShowcaseCheckout, STRIPE_TEST_CARD } from "@/lib/stripe-demo";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("payment.stripeTestTitle") };
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export default async function StripeTestCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; error?: string }>;
}) {
  if (!isStripeDemoMode()) {
    redirect("/");
  }

  const { t } = await getServerI18n();
  const params = await searchParams;
  const sessionId = params.session_id ?? "";
  const checkout = sessionId ? await loadShowcaseCheckout(sessionId) : null;
  if (!checkout) notFound();

  if (checkout.paid) {
    redirect(`/zahlung/erfolg?session_id=${encodeURIComponent(sessionId)}`);
  }

  const grouped = STRIPE_TEST_CARD.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {t("payment.stripeTestEyebrow")}
      </p>
      <h1 className="mt-2 text-4xl">{t("payment.stripeTestTitle")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {t("payment.stripeTestIntro")}
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{checkout.title}</p>
        <p className="mt-1 font-heading text-3xl">{formatEuro(checkout.amountCents)}</p>

        <form action={confirmShowcasePaymentAction} className="mt-6 space-y-4">
          <input type="hidden" name="sessionId" value={sessionId} />
          <div className="space-y-2">
            <Label htmlFor="card">{t("payment.stripeTestCard")}</Label>
            <Input
              id="card"
              name="card"
              inputMode="numeric"
              autoComplete="cc-number"
              defaultValue={grouped}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expiry">{t("payment.stripeTestExpiry")}</Label>
              <Input id="expiry" name="expiry" defaultValue="12/34" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cvc">{t("payment.stripeTestCvc")}</Label>
              <Input id="cvc" name="cvc" defaultValue="123" required />
            </div>
          </div>
          {params.error === "card" ? (
            <p className="text-sm text-destructive">{t("payment.stripeTestCardError")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("payment.stripeTestHint")}</p>
          )}
          <Button type="submit" className="w-full" size="lg">
            {t("payment.stripeTestPay", { amount: formatEuro(checkout.amountCents) })}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/zahlung/abbruch" className="text-muted-foreground underline-offset-4 hover:underline">
          {t("payment.stripeTestCancel")}
        </Link>
      </p>
    </div>
  );
}
