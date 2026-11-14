import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSyncOffer } from "@/components/calendar-sync-offer";
import { CheckoutSuccessCleanup } from "@/components/court-checkout-cleanup";
import { TennisWhatsAppInviteDialog } from "@/components/tennis-whatsapp-invite";
import { fulfillStripeSession } from "@/app/actions/checkout";
import { getCurrentUser } from "@/lib/auth";
import { courseHasCalendarSchedule } from "@/lib/course-schedule";
import { getServerI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { listAllStripeSecretKeys } from "@/lib/section-payments";
import { isShowcaseSessionId, loadShowcaseCheckout } from "@/lib/stripe-demo";
import { isTennisSeasonAddonPlan } from "@/lib/tennis-whatsapp";
import { tennisWhatsAppInviteDismissed } from "@/lib/tennis-whatsapp-status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("payment.successTitle") };
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string;
    kostenlos?: string;
    kurs?: string;
    abo?: string;
    platz?: string;
    geraet?: string;
  }>;
}) {
  const { t } = await getServerI18n();
  const params = await searchParams;
  let title: string | null = null;
  let kind: "course" | "subscription" | "court" | "device" = "course";
  let membershipCard = false;
  let membershipCardSent: boolean | null = null;
  let tennisSeasonCard = false;
  let courseIdForOffer: string | null = params.kurs ?? null;

  // Nur Stripe-Session aktiviert Buchungen. ?reservation= darf nicht mehr freischalten.
  if (params.session_id && isShowcaseSessionId(params.session_id)) {
    const showcase = await loadShowcaseCheckout(params.session_id);
    title = showcase?.title ?? null;
    kind = showcase?.kind ?? "course";
    if (showcase?.kind === "subscription") {
      const subscription = await prisma.subscription.findFirst({
        where: { stripeSessionId: params.session_id },
        include: { plan: { include: { section: { select: { name: true } } } } },
      });
      membershipCard = subscription?.plan.kind === "MEMBERSHIP";
      tennisSeasonCard = subscription
        ? isTennisSeasonAddonPlan(subscription.plan)
        : false;
    }
    if (showcase?.kind === "course") {
      const enrollment = await prisma.enrollment.findFirst({
        where: { stripeSessionId: params.session_id },
        select: { courseId: true },
      });
      courseIdForOffer = enrollment?.courseId ?? courseIdForOffer;
    }
  } else if (params.session_id && (await listAllStripeSecretKeys()).length > 0) {
    try {
      const result = await fulfillStripeSession(params.session_id);
      title = result?.title ?? null;
      if (result?.kind === "subscription") kind = "subscription";
      else if (result?.kind === "court") kind = "court";
      else if (result?.kind === "device") kind = "device";
      else kind = "course";
      membershipCard = Boolean(
        result && "membershipCard" in result && result.membershipCard,
      );
      if (result && "membershipCardSent" in result) {
        membershipCardSent = Boolean(result.membershipCardSent);
      }
      if (result && "tennisSeasonCard" in result) {
        tennisSeasonCard = Boolean(result.tennisSeasonCard);
      }
      if (
        kind === "course" &&
        !courseIdForOffer &&
        result &&
        "courseId" in result &&
        typeof result.courseId === "string"
      ) {
        courseIdForOffer = result.courseId;
      }
    } catch (error) {
      // Zahlung ist bei Stripe schon durch – Seite darf nicht abstürzen.
      console.error("Zahlungserfolg fulfill", params.session_id, error);
    }
  } else if (params.geraet) {
    const device = await prisma.device.findUnique({ where: { id: params.geraet } });
    title = device?.name ?? null;
    kind = "device";
  } else if (params.platz) {
    kind = "court";
  } else if (params.abo) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: params.abo },
      include: { section: { select: { name: true } } },
    });
    title = plan?.title ?? null;
    kind = "subscription";
    membershipCard = plan?.kind === "MEMBERSHIP";
    tennisSeasonCard = plan ? isTennisSeasonAddonPlan(plan) : false;
  } else if (params.kurs) {
    const course = await prisma.course.findUnique({ where: { id: params.kurs } });
    title = course?.title ?? null;
  }

  const user = await getCurrentUser();
  const hideWhatsAppInvite = await tennisWhatsAppInviteDismissed(
    user?.id ?? null,
  );
  let calendarOffer: "tennis" | "courses" | null = null;
  if (user && (kind === "court" || kind === "course")) {
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        calendarSyncEnabled: true,
        calendarSyncTennisPromptDismissed: true,
      },
    });
    if (profile && !profile.calendarSyncEnabled) {
      if (kind === "court" && !profile.calendarSyncTennisPromptDismissed) {
        calendarOffer = "tennis";
      } else if (kind === "course" && courseIdForOffer) {
        const course = await prisma.course.findUnique({
          where: { id: courseIdForOffer },
          select: {
            startsAt: true,
            endsAt: true,
            scheduleWeekdays: true,
            scheduleStartMinute: true,
            scheduleEndMinute: true,
          },
        });
        if (course && courseHasCalendarSchedule(course)) {
          calendarOffer = "courses";
        }
      }
    }
  }

  const successMessage = title
    ? kind === "subscription"
      ? t("payment.successAbo", { title })
      : kind === "court"
        ? t("payment.successCourt", { title })
        : kind === "device"
          ? t("payment.successDevice", { title })
          : t("payment.successCourse", { title })
    : t("payment.successGeneric");

  const chargeMessage =
    params.kostenlos === "1"
      ? t("payment.nothingCharged")
      : params.session_id
        ? t("payment.paymentReceived")
        : null;

  const cardMessage = membershipCard
    ? membershipCardSent === true
      ? t("payment.cardEmailed")
      : membershipCardSent === false
        ? t("payment.cardReadyEmailFailed")
        : t("payment.cardReadyFallback")
    : null;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
      <CheckoutSuccessCleanup />
      {tennisSeasonCard && !hideWhatsAppInvite ? (
        <TennisWhatsAppInviteDialog open source="payment_success" />
      ) : null}
      {calendarOffer ? (
        <CalendarSyncOffer open kind={calendarOffer} />
      ) : null}
      <h1 className="text-4xl">{t("payment.successTitle")}</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        {successMessage}{" "}
        {chargeMessage}
        {cardMessage ? ` ${cardMessage}` : null}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {kind === "court" ? (
          <Link
            href="/tennisplatz"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.backCalendar")}
          </Link>
        ) : kind === "device" ? (
          <Link
            href="/autos"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.backAutos")}
          </Link>
        ) : (
          <Link
            href="/konto"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {t("payment.backBookings")}
          </Link>
        )}
        {membershipCard ? (
          <Link
            href="/konto/mitgliedskarte"
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            {t("payment.viewCard")}
          </Link>
        ) : null}
        <Link
          href={
            kind === "subscription"
              ? "/abos"
              : kind === "court"
                ? "/tennisplatz"
                : kind === "device"
                  ? "/autos"
                  : "/kurse"
          }
          className="inline-flex h-9 items-center text-sm underline"
        >
          {kind === "subscription"
            ? t("payment.moreSubscriptions")
            : kind === "court"
              ? t("payment.bookAnotherCourt")
              : kind === "device"
                ? t("payment.bookAnotherCar")
                : t("payment.moreCourses")}
        </Link>
      </div>
    </div>
  );
}
