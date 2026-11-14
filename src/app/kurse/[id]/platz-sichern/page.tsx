import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WaitlistOfferCheckout } from "@/components/waitlist-offer-checkout";
import { validateWaitlistOfferAccess } from "@/app/actions/waitlist";
import { getCurrentUser } from "@/lib/auth";
import { canActFor } from "@/lib/family";
import { getSectionCreditBalance } from "@/lib/section-credit";
import { isSectionBankConfigured, isSectionStripeConfigured } from "@/lib/section-payments";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Platz sichern" };

export default async function WaitlistOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enrollment?: string; token?: string }>;
}) {
  const { id: courseId } = await params;
  const query = await searchParams;
  const enrollmentId = query.enrollment?.trim() ?? "";
  const token = query.token?.trim() ?? "";

  if (!enrollmentId || !token) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/anmelden?next=${encodeURIComponent(`/kurse/${courseId}/platz-sichern?enrollment=${enrollmentId}&token=${token}`)}`,
    );
  }

  const access = await validateWaitlistOfferAccess(courseId, enrollmentId, token);
  if ("error" in access) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
        <h1 className="text-3xl text-primary">Platz-Angebot abgelaufen</h1>
        <p className="mt-4 text-muted-foreground">{access.error}</p>
        <Link href={`/kurse/${courseId}`} className="mt-6 inline-block underline">
          Zurück zum Kurs
        </Link>
      </div>
    );
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { name: true, id: true } },
      course: { select: { title: true, sectionId: true, allowBankTransfer: true } },
    },
  });

  if (!enrollment?.offerExpiresAt) {
    notFound();
  }

  const allowed =
    (await canActFor(user.id, enrollment.userId)) ||
    enrollment.purchasedById === user.id ||
    user.role === "ADMIN";
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
        <h1 className="text-3xl text-primary">Keine Berechtigung</h1>
        <p className="mt-4 text-muted-foreground">
          Dieses Platz-Angebot gehört zu einer anderen Person in Ihrem Konto.
        </p>
      </div>
    );
  }

  const creditBalanceCents = await getSectionCreditBalance(
    user.id,
    enrollment.course.sectionId,
  );
  const priceCents = enrollment.paidCents ?? 0;
  const stripeAvailable = await isSectionStripeConfigured(
    enrollment.course.sectionId,
  );
  const bankTransferAvailable =
    enrollment.course.allowBankTransfer &&
    (await isSectionBankConfigured(enrollment.course.sectionId));

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
      <h1 className="text-3xl text-primary">Platz sichern</h1>
      <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <WaitlistOfferCheckout
          courseId={courseId}
          enrollmentId={enrollmentId}
          token={token}
          courseTitle={enrollment.course.title}
          memberName={enrollment.user.name}
          priceCents={priceCents}
          expiresAt={enrollment.offerExpiresAt.toISOString()}
          stripeAvailable={stripeAvailable}
          bankTransferAvailable={bankTransferAvailable}
          creditBalanceCents={creditBalanceCents}
        />
      </div>
    </div>
  );
}
