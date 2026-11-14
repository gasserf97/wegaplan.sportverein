"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatStripeCheckoutError,
  getAppUrl,
  getStripeForSection,
  productDescription,
  stripeCheckoutSessionCustomer,
  stripeCheckoutUnavailableError,
  withStripeAccounts,
} from "@/lib/stripe";
import {
  isSectionBankConfigured,
  isSectionStripeConfigured,
} from "@/lib/section-payments";
import { audienceMismatchReason } from "@/lib/courses-display";
import { getActionI18n } from "@/lib/i18n/action";
import { findOpenSubscriptionForPlan } from "@/lib/subscription-open";
import {
  intervalMeta,
  isPlanPubliclyVisible,
  isSubscriptionPeriodValid,
  renewSubscriptionPeriod,
} from "@/lib/subscriptions";
import {
  hasActiveClubMembership,
  shouldShowMembershipNotices,
} from "@/lib/membership";
import { expireStalePendingSubscriptions } from "@/lib/expire-pending";
import { fulfillCourtReservationSession } from "@/lib/activate-court-reservation";
import { fulfillDeviceReservationSession } from "@/lib/activate-device-reservation";
import { activateSubscription } from "@/lib/activate-subscription";
import {
  getOrCreateCourseEnrollment,
  enrollmentsMissingMandatoryDocuments,
  resolveMemberIds,
  validateCourseEnrollmentSelection,
} from "@/lib/course-enrollment";
import { canActFor } from "@/lib/family";
import { sendMembershipCardForSubscription } from "@/lib/membership-card";
import { sendCourseEnrollmentConfirmations } from "@/lib/booking-confirmation";
import { recordSubscriptionPayment } from "@/lib/subscription-payments";
import { externalPaymentDueCents } from "@/lib/payment-amounts";
import {
  estimateStripeFeeCents,
  fetchStripeFeeFromInvoice,
  fetchStripeFeeFromPaymentIntent,
  resolveCheckoutSessionStripeFees,
} from "@/lib/stripe-fees";
import {
  ageFromBirthDate,
  familyBundleLabel,
  isFamilyBundlePlan,
  quoteFamilySelection,
  resolveCoursePrice,
  resolvePlanPrice,
  type PlanPriceInput,
} from "@/lib/pricing";
import {
  allocateCreditAcrossItems,
  allocateCreditAcrossSeats,
  finalizeCourseEnrollmentPayments,
  finalizeSubscriptionPayments,
  getCreditBalance,
  reserveCourseCreditForBankTransfer,
  reserveSubscriptionCreditForBankTransfer,
} from "@/lib/credit";
import { revalidateEnrollmentViews } from "@/lib/revalidate-enrollments";
import { revalidateSubscriptionViews } from "@/lib/revalidate-subscriptions";
import { validateBundledMembershipPlan } from "@/lib/course-bundled-plan";
import {
  createBankTransferGroupId,
  createPaymentReference,
  type CheckoutPaymentChoice,
} from "@/lib/bank-transfer";
import { validateWaitlistOfferAccess } from "@/app/actions/waitlist";
import { startShowcaseCheckout } from "@/lib/stripe-demo";
import { clearWaitlistOfferData } from "@/lib/waitlist";

export type CheckoutState = { error: string } | { url: string } | null;

function checkoutEntityIds(csv: string | null | undefined, primary?: string) {
  return [
    ...new Set(
      [primary, ...(csv?.split(",") ?? [])].filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  ];
}

async function getOrCreateEnrollment(userId: string, courseId: string) {
  const result = await getOrCreateCourseEnrollment(userId, courseId);
  if (!result.ok) {
    return {
      ok: false as const,
      alreadyPaid: "alreadyPaid" in result ? result.alreadyPaid : undefined,
      error: result.error,
    };
  }
  return { ok: true as const, course: null as never, enrollment: result.enrollment };
}

export async function startCheckoutAction(
  courseId: string,
  memberIds?: string[],
  paymentMethod: CheckoutPaymentChoice = "stripe",
  _useCredit = false,
): Promise<CheckoutState> {
  // Guthaben ist nur noch für Tennisplätze nutzbar.
  const useCredit = false;
  void _useCredit;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=/kurse/${courseId}`);
  }

  const members = await resolveMemberIds(user.id, memberIds);
  if ("error" in members) return { error: members.error };

  const { assertProfilesReadyForBooking } = await import("@/lib/profile-db");
  const profiles = await assertProfilesReadyForBooking(user.id, members.ids);
  if ("error" in profiles) return { error: profiles.error };

  const validation = await validateCourseEnrollmentSelection(
    user.id,
    courseId,
    members.ids,
    user.role === "ADMIN",
  );
  if ("error" in validation) return { error: validation.error };
  const { course } = validation;
  const bundledPlanError = await validateBundledMembershipPlan(
    course.bundledPlanId,
  );
  if (bundledPlanError) return { error: bundledPlanError };

  const enrollments = [];
  for (const memberId of members.ids) {
    const result = await getOrCreateEnrollment(memberId, courseId);
    if (!result.ok) {
      if ("alreadyPaid" in result && result.alreadyPaid) continue;
      const person = validation.personById.get(memberId);
      return { error: `${person?.name ?? "Diese Person"}: ${result.error}` };
    }
    enrollments.push(result.enrollment);
    await prisma.enrollment.update({
      where: { id: result.enrollment.id },
      data: { purchasedById: user.id },
    });
  }

  if (enrollments.length === 0) {
    return { error: "Niemand in der Auswahl kann diesen Kurs buchen." };
  }

  const missingDocs = await enrollmentsMissingMandatoryDocuments(
    enrollments.map((item) => item.id),
    course,
  );
  if (missingDocs.length > 0) {
    return {
      error: `Bitte zuerst die Pflicht-Dokumente hochladen für: ${missingDocs.join(", ")}.`,
    };
  }

  const pricedEnrollments = enrollments.map((enrollment) => {
    const person = validation.personById.get(enrollment.userId);
    const quote = resolveCoursePrice(course, person?.birthDate ?? null);
    return { enrollment, priceCents: quote.cents };
  });
  const totalCourseCents = pricedEnrollments.reduce(
    (sum, item) => sum + item.priceCents,
    0,
  );

  if (totalCourseCents === 0) {
    const freeIds = enrollments.map((item) => item.id);
    await prisma.enrollment.updateMany({
      where: { id: { in: freeIds } },
      data: { status: "PAID", paidAt: new Date(), paidCents: 0, creditAppliedCents: 0 },
    });
    await sendCourseEnrollmentConfirmations(freeIds);
    const { grantBundledPlansForPaidEnrollments } = await import(
      "@/lib/course-bundled-plan"
    );
    await grantBundledPlansForPaidEnrollments(freeIds);
    revalidateEnrollmentViews(course.id);
    return { url: `/zahlung/erfolg?kostenlos=1&kurs=${course.id}` };
  }

  const creditBalance = useCredit ? await getCreditBalance(user.id) : 0;
  const allocations = allocateCreditAcrossItems(
    pricedEnrollments.map((item) => ({
      itemId: item.enrollment.id,
      priceCents: item.priceCents,
    })),
    creditBalance,
  ).map((item) => ({
    enrollmentId: item.itemId,
    priceCents: item.priceCents,
    creditCents: item.creditCents,
    cardCents: item.cardCents,
  }));
  const totalCardCents = allocations.reduce((sum, item) => sum + item.cardCents, 0);
  const totalCreditCents = allocations.reduce((sum, item) => sum + item.creditCents, 0);

  for (const allocation of allocations) {
    await prisma.enrollment.update({
      where: { id: allocation.enrollmentId },
      data: {
        creditAppliedCents: allocation.creditCents,
        paidCents: allocation.priceCents,
      },
    });
  }

  if (totalCardCents === 0 && totalCreditCents > 0) {
    await finalizeCourseEnrollmentPayments(
      user.id,
      enrollments.map((item) => item.id),
    );
    revalidateEnrollmentViews(course.id);
    return { url: `/zahlung/erfolg?kostenlos=1&kurs=${course.id}&guthaben=1` };
  }

  if (paymentMethod === "bank_transfer") {
    if (!course.allowBankTransfer) {
      return {
        error:
          "Überweisung ist für diesen Kurs nicht freigeschaltet. Bitte Kartenzahlung wählen oder den Verein kontaktieren.",
      };
    }
    if (!(await isSectionBankConfigured(course.sectionId))) {
      return { error: "Überweisung ist derzeit nicht eingerichtet." };
    }
    const paymentReference = createPaymentReference();
    const bankTransferGroupId = createBankTransferGroupId();
    await prisma.enrollment.updateMany({
      where: { id: { in: enrollments.map((item) => item.id) } },
      data: {
        paymentMethod: "BANK_TRANSFER",
        paymentReference,
        bankTransferGroupId,
      },
    });
    if (totalCreditCents > 0) {
      await reserveCourseCreditForBankTransfer(user.id, allocations, course.title);
    }
    revalidateEnrollmentViews(course.id);
    return {
      url: `/zahlung/ueberweisung?ref=${encodeURIComponent(paymentReference)}`,
    };
  }

  if (!(await isSectionStripeConfigured(course.sectionId))) {
    return { error: stripeCheckoutUnavailableError };
  }

  const enrollmentIds = enrollments.map((item) => item.id);
  const showcase = await startShowcaseCheckout(async (sessionId) => {
    await prisma.enrollment.updateMany({
      where: { id: { in: enrollmentIds } },
      data: { stripeSessionId: sessionId, paymentMethod: "STRIPE" },
    });
  });
  if (showcase) {
    revalidateEnrollmentViews(course.id);
    return showcase;
  }

  try {
    const stripe = await getStripeForSection(course.sectionId);
    const appUrl = await getAppUrl();
    const payer = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, phone: true, name: true },
    });
    if (!payer) {
      return { error: "Benutzer nicht gefunden." };
    }

    const people = await prisma.user.findMany({
      where: { id: { in: enrollments.map((item) => item.userId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(people.map((person) => [person.id, person.name]));

    const payableEnrollments = enrollments
      .map((enrollment) => {
        const allocation = allocations.find((item) => item.enrollmentId === enrollment.id);
        const priced = pricedEnrollments.find(
          (item) => item.enrollment.id === enrollment.id,
        );
        return {
          enrollment,
          cardCents: allocation?.cardCents ?? priced?.priceCents ?? course.priceCents,
        };
      })
      .filter((item) => item.cardCents > 0);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "hosted_page",
      ...(await stripeCheckoutSessionCustomer(payer, stripe)),
      locale: "de",
      line_items: payableEnrollments.map(({ enrollment, cardCents }) => ({
        quantity: 1,
        price_data: {
          currency: "eur" as const,
          unit_amount: cardCents,
          product_data: {
            name: `${course.title} – ${nameById.get(enrollment.userId) ?? "Mitglied"}`,
            ...productDescription(course.description),
          },
        },
      })),
      metadata: {
        kind: "course",
        enrollmentId: enrollments[0].id,
        enrollmentIds: enrollments.map((item) => item.id).join(","),
        courseId: course.id,
        sectionId: course.sectionId ?? "",
        userId: user.id,
        creditAppliedCents: String(totalCreditCents),
        payerUserId: user.id,
      },
      success_url: `${appUrl}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/zahlung/abbruch?kurs=${course.id}`,
    });

    await prisma.enrollment.updateMany({
      where: { id: { in: enrollments.map((item) => item.id) } },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) {
      return { error: "Stripe hat keine Zahlungsseite geliefert." };
    }

    revalidateEnrollmentViews(course.id);
    return { url: session.url };
  } catch (error) {
    console.error("Stripe Kurs-Checkout", error);
    return { error: formatStripeCheckoutError(error) };
  }
}

export async function startWaitlistOfferCheckoutAction(
  courseId: string,
  enrollmentId: string,
  token: string,
  paymentMethod: CheckoutPaymentChoice = "stripe",
  _useCredit = false,
): Promise<CheckoutState> {
  const useCredit = false;
  void _useCredit;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=/kurse/${courseId}/platz-sichern?enrollment=${enrollmentId}&token=${token}`);
  }

  const access = await validateWaitlistOfferAccess(courseId, enrollmentId, token);
  if ("error" in access) return { error: access.error ?? "Angebot ungültig." };

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true, user: { select: { name: true } } },
  });
  if (!enrollment) return { error: "Anmeldung nicht gefunden." };
  const bundledPlanError = await validateBundledMembershipPlan(
    enrollment.course.bundledPlanId,
  );
  if (bundledPlanError) return { error: bundledPlanError };

  const allowed =
    (await canActFor(user.id, enrollment.userId)) ||
    enrollment.purchasedById === user.id ||
    user.role === "ADMIN";
  if (!allowed) return { error: "Keine Berechtigung." };

  const priceCents = enrollment.paidCents ?? enrollment.course.priceCents;

  if (priceCents === 0) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidCents: 0,
        creditAppliedCents: 0,
        ...clearWaitlistOfferData(),
      },
    });
    await sendCourseEnrollmentConfirmations([enrollment.id]);
    const { grantBundledPlansForPaidEnrollments } = await import(
      "@/lib/course-bundled-plan"
    );
    await grantBundledPlansForPaidEnrollments([enrollment.id]);
    revalidateEnrollmentViews(courseId);
    return { url: `/zahlung/erfolg?kostenlos=1&kurs=${courseId}` };
  }

  const creditBalance = useCredit ? await getCreditBalance(user.id) : 0;
  const allocations = allocateCreditAcrossSeats([enrollment.id], priceCents, creditBalance);
  const allocation = allocations[0];
  const cardCents = allocation?.cardCents ?? priceCents;
  const creditCents = allocation?.creditCents ?? 0;

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      creditAppliedCents: creditCents,
      paidCents: priceCents,
      purchasedById: user.id,
    },
  });

  if (cardCents === 0 && creditCents > 0) {
    await finalizeCourseEnrollmentPayments(user.id, [enrollment.id]);
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: clearWaitlistOfferData(),
    });
    revalidateEnrollmentViews(courseId);
    return { url: `/zahlung/erfolg?kostenlos=1&kurs=${courseId}&guthaben=1` };
  }

  if (paymentMethod === "bank_transfer") {
    if (!enrollment.course.allowBankTransfer) {
      return {
        error:
          "Überweisung ist für diesen Kurs nicht freigeschaltet. Bitte Kartenzahlung wählen oder den Verein kontaktieren.",
      };
    }
    if (!(await isSectionBankConfigured(enrollment.course.sectionId))) {
      return { error: "Überweisung ist derzeit nicht eingerichtet." };
    }
    const paymentReference = createPaymentReference();
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        paymentMethod: "BANK_TRANSFER",
        paymentReference,
        bankTransferGroupId: createBankTransferGroupId(),
      },
    });
    if (creditCents > 0) {
      await reserveCourseCreditForBankTransfer(
        user.id,
        [{ enrollmentId: enrollment.id, priceCents, creditCents, cardCents }],
        enrollment.course.title,
      );
    }
    revalidateEnrollmentViews(courseId);
    return {
      url: `/zahlung/ueberweisung?ref=${encodeURIComponent(paymentReference)}`,
    };
  }

  if (!(await isSectionStripeConfigured(enrollment.course.sectionId))) {
    return { error: stripeCheckoutUnavailableError };
  }

  const showcaseOffer = await startShowcaseCheckout(async (sessionId) => {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { stripeSessionId: sessionId, paymentMethod: "STRIPE" },
    });
  });
  if (showcaseOffer) {
    revalidateEnrollmentViews(courseId);
    return showcaseOffer;
  }

  try {
    const stripe = await getStripeForSection(enrollment.course.sectionId);
    const appUrl = await getAppUrl();
    const payer = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, phone: true, name: true },
    });
    if (!payer) return { error: "Benutzer nicht gefunden." };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "hosted_page",
      ...(await stripeCheckoutSessionCustomer(payer, stripe)),
      locale: "de",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur" as const,
            unit_amount: cardCents,
            product_data: {
              name: `${enrollment.course.title} – ${enrollment.user.name} (Warteliste)`,
              ...productDescription(enrollment.course.description),
            },
          },
        },
      ],
      metadata: {
        kind: "course",
        enrollmentId: enrollment.id,
        enrollmentIds: enrollment.id,
        courseId,
        sectionId: enrollment.course.sectionId ?? "",
        userId: user.id,
        creditAppliedCents: String(creditCents),
        payerUserId: user.id,
        waitlistOffer: "1",
      },
      success_url: `${appUrl}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/kurse/${courseId}/platz-sichern?enrollment=${enrollmentId}&token=${token}`,
    });

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { stripeSessionId: session.id },
    });

    if (!session.url) {
      return { error: "Stripe hat keine Zahlungsseite geliefert." };
    }
    revalidateEnrollmentViews(courseId);
    return { url: session.url };
  } catch (error) {
    console.error("Stripe Wartelisten-Checkout", error);
    return { error: formatStripeCheckoutError(error) };
  }
}

async function getOrCreateSubscription(
  userId: string,
  planId: string,
  autoRenew: boolean,
) {
  await expireStalePendingSubscriptions();
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.published) {
    return { ok: false as const, error: "Diese Mitgliedschaft ist nicht verfügbar." };
  }

  const open = await findOpenSubscriptionForPlan(userId, planId);
  const existing = open.subscription;

  if (
    existing?.status === "ACTIVE" &&
    (open.currentlyValid || isSubscriptionPeriodValid(existing.periodEnd))
  ) {
    return {
      ok: false as const,
      alreadyActive: true as const,
      error: "Sie haben diese Mitgliedschaft bereits.",
    };
  }

  const consentedAutoRenew = plan.autoRenewOffered && autoRenew;

  // Expired ACTIVE → reopen as PENDING so the user can renew.
  // Clear prior payment fields so a stale BANK_TRANSFER does not look like
  // an open Überweisung in admin lists until the user chooses again.
  if (existing?.status === "ACTIVE") {
    const renewed = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        autoRenew: consentedAutoRenew,
        paidAt: null,
        paidCents: null,
        creditAppliedCents: 0,
        paymentMethod: null,
        paymentReference: null,
        bankTransferGroupId: null,
        bankTransferApprovedAt: null,
        bankTransferApprovedById: null,
        stripeSessionId: null,
      },
    });
    return {
      ok: true as const,
      plan,
      subscription: renewed,
    };
  }

  const subscription =
    existing ??
    (await prisma.subscription.create({
      data: {
        userId,
        planId,
        status: "PENDING",
        autoRenew: consentedAutoRenew,
      },
    }));

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { autoRenew: consentedAutoRenew },
    });
  }

  return {
    ok: true as const,
    plan,
    subscription: { ...subscription, autoRenew: consentedAutoRenew },
  };
}

async function birthDateFor(userId: string) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthDate: true },
  });
  return row?.birthDate ?? null;
}

async function quotePlanForUser(userId: string, plan: PlanPriceInput) {
  return resolvePlanPrice(plan, await birthDateFor(userId));
}

async function agesForMembers(memberIds: string[]) {
  const people = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, birthDate: true },
  });
  return people.map((person) => ({
    id: person.id,
    age: ageFromBirthDate(person.birthDate),
  }));
}

export async function startSubscriptionCheckoutAction(
  planId: string,
  autoRenew: boolean,
  memberIds?: string[],
  paymentMethod: CheckoutPaymentChoice = "stripe",
  _useCredit = false,
): Promise<CheckoutState> {
  const useCredit = false;
  void _useCredit;
  const { t } = await getActionI18n();
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=/abos/${planId}`);
  }

  const members = await resolveMemberIds(user.id, memberIds);
  if ("error" in members) return { error: members.error };

  const { assertProfilesReadyForBooking } = await import("@/lib/profile-db");
  const profiles = await assertProfilesReadyForBooking(user.id, members.ids);
  if ("error" in profiles) return { error: profiles.error };

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !isPlanPubliclyVisible(plan)) {
    return { error: "Diese Mitgliedschaft ist nicht verfügbar." };
  }

  const isBundle = isFamilyBundlePlan(plan);
  const meta = intervalMeta(plan.interval, t);
  const wantsRenew = autoRenew && plan.autoRenewOffered && Boolean(meta.stripe);
  if (useCredit && wantsRenew) {
    return { error: "Guthaben ist bei automatischer Verlängerung nicht verfügbar." };
  }

  const selectedPeople = await prisma.user.findMany({
    where: { id: { in: members.ids } },
    select: { id: true, name: true, birthDate: true },
  });
  const personById = new Map(selectedPeople.map((person) => [person.id, person]));

  const created = [];
  for (const memberId of members.ids) {
    const person = personById.get(memberId);
    const mismatch = person
      ? audienceMismatchReason(
          ageFromBirthDate(person.birthDate),
          plan.audienceMinAge,
          plan.audienceMaxAge,
          t,
        )
      : null;
    if (mismatch) {
      return { error: `${person?.name ?? "Diese Person"}: ${mismatch}.` };
    }

    if (
      shouldShowMembershipNotices() &&
      plan.kind !== "MEMBERSHIP" &&
      user.role !== "ADMIN"
    ) {
      if (!(await hasActiveClubMembership(memberId))) {
        return {
          error: `${person?.name ?? "Diese Person"} braucht zuerst die Vereinsmitgliedschaft.`,
        };
      }
    }

    const result = await getOrCreateSubscription(memberId, planId, autoRenew);
    if (!result.ok) {
      if ("alreadyActive" in result && result.alreadyActive) continue;
      return { error: result.error };
    }
    created.push({
      subscription: result.subscription,
      plan: result.plan,
      memberId,
    });
    await prisma.subscription.update({
      where: { id: result.subscription.id },
      data: { purchasedById: user.id },
    });
  }

  if (created.length === 0) {
    return { error: "Diese Personen haben die Mitgliedschaft bereits." };
  }

  const ages = await agesForMembers(created.map((item) => item.memberId));
  const familyQuote = isBundle ? quoteFamilySelection(ages, plan) : null;

  const priced = [];
  for (const item of created) {
    const individualQuote = await quotePlanForUser(item.memberId, item.plan);
    priced.push({
      ...item,
      quote: isBundle
        ? {
            cents: familyQuote?.paidByMemberId[item.memberId] ?? 0,
            band: individualQuote.band,
          }
        : individualQuote,
    });
  }

  const people = await prisma.user.findMany({
    where: { id: { in: priced.map((item) => item.memberId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(people.map((person) => [person.id, person.name]));

  const totalCents = isBundle
    ? familyQuote?.totalCents ?? 0
    : priced.reduce((sum, item) => sum + item.quote.cents, 0);

  const creditBalance = useCredit ? await getCreditBalance(user.id) : 0;
  const allocations = allocateCreditAcrossItems(
    priced.map((item) => ({
      itemId: item.subscription.id,
      priceCents: item.quote.cents,
    })),
    creditBalance,
  );
  const allocationBySubscriptionId = new Map(
    allocations.map((item) => [item.itemId, item]),
  );
  const totalCreditCents = allocations.reduce((sum, item) => sum + item.creditCents, 0);
  const totalCardCents = allocations.reduce((sum, item) => sum + item.cardCents, 0);

  for (const allocation of allocations) {
    await prisma.subscription.update({
      where: { id: allocation.itemId },
      data: {
        creditAppliedCents: allocation.creditCents,
        paidCents: allocation.priceCents,
      },
    });
  }

  const free = totalCents === 0 ? priced : [];
  const paid = totalCents > 0 ? priced : [];

  for (const item of free) {
    await activateSubscription(item.subscription.id, { paidCents: 0 });
  }

  if (paid.length === 0) {
    return { url: `/zahlung/erfolg?kostenlos=1&abo=${plan.id}` };
  }

  if (totalCardCents === 0 && totalCreditCents > 0) {
    await finalizeSubscriptionPayments(
      user.id,
      priced.map((item) => item.subscription.id),
    );
    for (const item of priced) {
      await activateSubscription(item.subscription.id, {
        paidCents: item.quote.cents,
        paymentSource: "checkout",
        skipPaymentRecord: true,
      });
    }
    return { url: `/zahlung/erfolg?kostenlos=1&abo=${plan.id}&guthaben=1` };
  }

  if (paymentMethod === "bank_transfer") {
    if (!plan.allowBankTransfer) {
      return {
        error:
          "Überweisung ist für diese Mitgliedschaft nicht freigeschaltet. Bitte Kartenzahlung wählen oder den Verein kontaktieren.",
      };
    }
    if (!(await isSectionBankConfigured(plan.sectionId))) {
      return { error: "Überweisung ist derzeit nicht eingerichtet." };
    }
    const paymentReference = createPaymentReference();
    const bankTransferGroupId = createBankTransferGroupId();
    for (const item of priced) {
      await prisma.subscription.update({
        where: { id: item.subscription.id },
        data: {
          paymentMethod: "BANK_TRANSFER",
          paymentReference,
          bankTransferGroupId,
          autoRenew: false,
        },
      });
    }
    if (totalCreditCents > 0) {
      await reserveSubscriptionCreditForBankTransfer(
        user.id,
        allocations,
        plan.title,
      );
    }
    revalidateSubscriptionViews(plan.id);
    return {
      url: `/zahlung/ueberweisung?ref=${encodeURIComponent(paymentReference)}`,
    };
  }

  if (!(await isSectionStripeConfigured(plan.sectionId))) {
    return { error: stripeCheckoutUnavailableError };
  }

  try {
    const stripe = await getStripeForSection(plan.sectionId);
    const appUrl = await getAppUrl();
    const payer = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, phone: true, name: true },
    });
    if (!payer) {
      return { error: "Benutzer nicht gefunden." };
    }

    const meta = intervalMeta(plan.interval, t);
    const wantsRenew = autoRenew && plan.autoRenewOffered && Boolean(meta.stripe);
    const recurring =
      wantsRenew && meta.stripe
        ? { recurring: { interval: meta.stripe } }
        : {};
    const sessionMeta = {
      kind: "subscription",
      subscriptionId: paid[0].subscription.id,
      subscriptionIds: paid.map((item) => item.subscription.id).join(","),
      planId: plan.id,
      sectionId: plan.sectionId ?? "",
      userId: user.id,
      creditAppliedCents: String(totalCreditCents),
      payerUserId: user.id,
    };

    const lineItems =
      totalCreditCents > 0 && isBundle && familyQuote
        ? totalCardCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "eur" as const,
                  unit_amount: totalCardCents,
                  ...recurring,
                  product_data: {
                    name: plan.title,
                    ...productDescription(`${plan.description} (${meta.label})`),
                  },
                },
              },
            ]
          : []
        : isBundle && familyQuote
      ? [
          ...(familyQuote.familyPacks > 0 && familyQuote.familyPriceCents != null
            ? [
                {
                  quantity: familyQuote.familyPacks,
                  price_data: {
                    currency: "eur" as const,
                    unit_amount: familyQuote.familyPriceCents,
                    ...recurring,
                    product_data: {
                      name: `${plan.title} – Familienkarte (${familyBundleLabel(plan)})`,
                      ...productDescription(`${plan.description} (${meta.label})`),
                    },
                  },
                },
              ]
            : []),
          ...(familyQuote.remainingAdults > 0
            ? [
                {
                  quantity: familyQuote.remainingAdults,
                  price_data: {
                    currency: "eur" as const,
                    unit_amount: familyQuote.adultPriceCents,
                    ...recurring,
                    product_data: {
                      name: `${plan.title} – Erwachsene`,
                      ...productDescription(`${plan.description} (${meta.label})`),
                    },
                  },
                },
              ]
            : []),
          ...(familyQuote.remainingChildren > 0
            ? [
                {
                  quantity: familyQuote.remainingChildren,
                  price_data: {
                    currency: "eur" as const,
                    unit_amount: familyQuote.childPriceCents,
                    ...recurring,
                    product_data: {
                      name: `${plan.title} – Kinder`,
                      ...productDescription(`${plan.description} (${meta.label})`),
                    },
                  },
                },
              ]
            : []),
        ]
      : paid
          .map((item) => {
            const cardCents =
              allocationBySubscriptionId.get(item.subscription.id)?.cardCents ??
              item.quote.cents;
            return { item, cardCents };
          })
          .filter(({ cardCents }) => cardCents > 0)
          .map(({ item, cardCents }) => ({
          quantity: 1,
          price_data: {
            currency: "eur" as const,
            unit_amount: cardCents,
            ...recurring,
            product_data: {
              name: `${plan.title} – ${nameById.get(item.memberId) ?? "Mitglied"} (${
                item.quote.band === "child" ? "Kinder" : "Erwachsene"
              })`,
              ...productDescription(`${plan.description} (${meta.label})`),
            },
          },
        }));

    if (lineItems.length === 0) {
      return { error: "Keine zahlungspflichtigen Positionen." };
    }

    const pricedIds = priced.map((item) => item.subscription.id);
    const showcasePlan = await startShowcaseCheckout(async (sessionId) => {
      for (const id of pricedIds) {
        await prisma.subscription.update({
          where: { id },
          data: { stripeSessionId: sessionId, paymentMethod: "STRIPE" },
        });
      }
    });
    if (showcasePlan) {
      revalidateSubscriptionViews(plan.id);
      return showcasePlan;
    }

    const savePaymentForRenewal =
      autoRenew && plan.autoRenewOffered && !wantsRenew && totalCents > 0;

    const session = await stripe.checkout.sessions.create({
      mode: wantsRenew ? "subscription" : "payment",
      ui_mode: "hosted_page",
      ...(await stripeCheckoutSessionCustomer(payer, stripe)),
      locale: "de",
      line_items: lineItems,
      metadata: sessionMeta,
      ...(wantsRenew ? { subscription_data: { metadata: sessionMeta } } : {}),
      ...(savePaymentForRenewal
        ? { payment_intent_data: { setup_future_usage: "off_session" as const } }
        : {}),
      success_url: `${appUrl}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/zahlung/abbruch?abo=${plan.id}`,
    });


    for (const item of priced) {
      await prisma.subscription.update({
        where: { id: item.subscription.id },
        data: {
          stripeSessionId: session.id,
        },
      });
    }

    if (!session.url) {
      return { error: "Stripe hat keine Zahlungsseite geliefert." };
    }

    revalidateSubscriptionViews(plan.id);
    return { url: session.url };
  } catch (error) {
    console.error("Stripe Abo-Checkout", error);
    return { error: formatStripeCheckoutError(error) };
  }
}

export async function fulfillStripeSession(sessionId: string) {
  const session = await withStripeAccounts((stripe) =>
    stripe.checkout.sessions.retrieve(sessionId),
  );
  if (session.payment_status !== "paid") return null;

  const kind = session.metadata?.kind;

  if (kind === "court") {
    return fulfillCourtReservationSession(sessionId);
  }

  if (kind === "device") {
    return fulfillDeviceReservationSession(sessionId);
  }

  if (kind === "subscription" || session.metadata?.subscriptionId) {
    const subscriptionIds = checkoutEntityIds(
      session.metadata?.subscriptionIds,
      session.metadata?.subscriptionId,
    );
    const matches = await prisma.subscription.findMany({
      where: {
        OR: [
          { stripeSessionId: session.id },
          ...(subscriptionIds.length > 0
            ? [{ id: { in: subscriptionIds } }]
            : []),
        ],
      },
      include: { plan: true },
    });
    const stripeSubId =
      typeof session.subscription === "string" ? session.subscription : undefined;
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : undefined;
    const stripePaymentId =
      typeof session.payment_intent === "string" ? session.payment_intent : undefined;
    const items = matches;
    let last = null;
    let membershipCard = false;
    let membershipCardSent = false;
    const activationErrors: unknown[] = [];
    const payerUserId = session.metadata?.payerUserId ?? session.metadata?.userId;
    const creditApplied = Number(session.metadata?.creditAppliedCents ?? 0);
    if (payerUserId && creditApplied > 0) {
      await finalizeSubscriptionPayments(
        payerUserId,
        items.map((item) => item.id),
      );
    }
    const subscriptionFees = await resolveCheckoutSessionStripeFees(
      session.id,
      items.map((item) => ({
        key: item.id,
        externalCents: externalPaymentDueCents(
          item.paidCents,
          item.plan.priceCents,
          item.creditAppliedCents,
          false,
        ),
      })),
    );
    for (const item of items) {
      try {
        const activated = await activateSubscription(item.id, {
          stripeSubscriptionId: stripeSubId,
          stripeCustomerId,
          paidCents: item.paidCents ?? undefined,
          paymentMethod: "STRIPE",
          paymentSource: "checkout",
          stripePaymentId,
          stripeFeeCents: subscriptionFees.get(item.id)?.feeCents ?? null,
        });
        if (!activated) {
          activationErrors.push(
            new Error(`Abo ${item.id} konnte nicht aktiviert werden.`),
          );
          continue;
        }
        last = activated;
        if (activated.plan.kind === "MEMBERSHIP") {
          membershipCard = true;
          if (activated.membershipCardSent) membershipCardSent = true;
        }
      } catch (error) {
        activationErrors.push(error);
        console.error("Familien-Abo aktivieren", item.id, error);
      }
    }
    if (activationErrors.length > 0) {
      throw new AggregateError(
        activationErrors,
        `${activationErrors.length} Familien-Abo(s) konnten nicht aktiviert werden.`,
      );
    }
    let tennisSeasonCard = false;
    if (last?.plan.kind === "ADDON") {
      const planWithSection = await prisma.subscriptionPlan.findUnique({
        where: { id: last.planId },
        select: { kind: true, section: { select: { name: true } } },
      });
      tennisSeasonCard =
        planWithSection?.kind === "ADDON" &&
        planWithSection.section?.name === "Tennis";
    }
    return last
      ? {
          kind: "subscription" as const,
          title: last.plan.title,
          membershipCard,
          membershipCardSent,
          tennisSeasonCard,
        }
      : null;
  }

  const enrollmentIds = checkoutEntityIds(
    session.metadata?.enrollmentIds,
    session.metadata?.enrollmentId,
  );
  const toPay = await prisma.enrollment.findMany({
    where: {
      OR: [
        { stripeSessionId: session.id },
        ...(enrollmentIds.length > 0
          ? [{ id: { in: enrollmentIds } }]
          : []),
      ],
    },
    include: { course: true },
  });

  if (toPay.length === 0) return null;

  const payerUserId = session.metadata?.payerUserId ?? session.metadata?.userId;
  const paidEnrollmentIds = toPay.map((item) => item.id);
  if (payerUserId && Number(session.metadata?.creditAppliedCents ?? 0) > 0) {
    await finalizeCourseEnrollmentPayments(payerUserId, paidEnrollmentIds);
    await prisma.enrollment.updateMany({
      where: { id: { in: paidEnrollmentIds } },
      data: { stripeSessionId: session.id, paymentMethod: "STRIPE" },
    });
  } else {
    const now = new Date();
    await prisma.$transaction(
      toPay.map((enrollment) =>
        prisma.enrollment.update({
          where: { id: enrollment.id },
          data: {
            status: "PAID",
            paidAt: now,
            stripeSessionId: session.id,
            paymentMethod: "STRIPE",
            paidCents: enrollment.paidCents ?? enrollment.course.priceCents,
            ...clearWaitlistOfferData(),
          },
        }),
      ),
    );
  }

  const enrollmentFees = await resolveCheckoutSessionStripeFees(
    session.id,
    toPay.map((enrollment) => ({
      key: enrollment.id,
      externalCents: externalPaymentDueCents(
        enrollment.paidCents,
        enrollment.course.priceCents,
        enrollment.creditAppliedCents,
        false,
      ),
    })),
  );
  for (const enrollment of toPay) {
    const fee = enrollmentFees.get(enrollment.id)?.feeCents;
    if (fee != null) {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { stripeFeeCents: fee },
      });
    }
  }

  await sendCourseEnrollmentConfirmations(paidEnrollmentIds).catch((error) => {
    console.error("Kurs-Bestätigungsmails", paidEnrollmentIds, error);
  });

  const { grantBundledPlansForPaidEnrollments } = await import(
    "@/lib/course-bundled-plan"
  );
  await grantBundledPlansForPaidEnrollments(paidEnrollmentIds);

  revalidateEnrollmentViews(toPay.map((item) => item.courseId));
  return {
    kind: "course" as const,
    title: toPay[0].course.title,
    courseId: toPay[0].courseId,
  };
}

export async function fulfillStripeSubscriptionInvoice(
  stripeSubscriptionId: string,
  invoice?: { id?: string; amount_paid?: number | null; paidAt?: Date },
) {
  const subscriptions = await prisma.subscription.findMany({
    where: { stripeSubscriptionId },
    include: { plan: true },
  });
  if (subscriptions.length === 0) {
    // Lokal bereits „abgebrochen“ (IDs geleert), Stripe rechnet aber weiter → hier stoppen.
    const { cancelOrphanStripeSubscription } = await import(
      "@/lib/stripe-subscription-cancel"
    );
    await cancelOrphanStripeSubscription(stripeSubscriptionId).catch((error) => {
      console.error(
        "Verwaiste Stripe-Abo-Kündigung",
        stripeSubscriptionId,
        error,
      );
    });
    return;
  }

  for (const subscription of subscriptions) {
    const amountCents =
      invoice?.amount_paid ?? subscription.plan.priceCents;

    if (!subscription.autoRenew) {
      if (amountCents > 0) {
        const stripeFeeCents =
          invoice?.id != null
            ? (await fetchStripeFeeFromInvoice(invoice.id)) ??
              estimateStripeFeeCents(amountCents)
            : estimateStripeFeeCents(amountCents);
        await recordSubscriptionPayment({
          subscriptionId: subscription.id,
          amountCents,
          source: "stripe_invoice",
          paidAt: invoice?.paidAt,
          stripePaymentId: invoice?.id,
          stripeFeeCents,
        });
      }
      const { syncStripeRecurringToLocalAutoRenew } = await import(
        "@/lib/stripe-subscription-cancel"
      );
      await syncStripeRecurringToLocalAutoRenew({
        ...subscription,
        autoRenew: false,
      }).catch((error) => {
        console.error(
          "Stripe-Abo nach unerwünschter Rechnung",
          subscription.id,
          error,
        );
      });
      continue;
    }

    const { periodStart, periodEnd } = renewSubscriptionPeriod(
      subscription.plan.interval,
      subscription.periodEnd,
    );

    const usePrepaid = subscription.prepaidRenewalCredits > 0;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        paidAt: new Date(),
        periodStart,
        periodEnd,
        ...(usePrepaid
          ? { prepaidRenewalCredits: { decrement: 1 } }
          : amountCents > 0
            ? { paidCents: amountCents }
            : {}),
      },
    });

    if (usePrepaid) {
      await recordSubscriptionPayment({
        subscriptionId: subscription.id,
        amountCents: 0,
        source: "course_bundle",
        paidAt: invoice?.paidAt,
        stripePaymentId: invoice?.id,
      });
    } else if (amountCents > 0) {
      const stripeFeeCents =
        invoice?.id != null
          ? (await fetchStripeFeeFromInvoice(invoice.id)) ??
            estimateStripeFeeCents(amountCents)
          : estimateStripeFeeCents(amountCents);
      await recordSubscriptionPayment({
        subscriptionId: subscription.id,
        amountCents,
        source: "stripe_invoice",
        paidAt: invoice?.paidAt,
        stripePaymentId: invoice?.id,
        stripeFeeCents,
      });
    }
    if (subscription.plan.kind === "MEMBERSHIP") {
      try {
        const result = await sendMembershipCardForSubscription(subscription.id, {
          force: true,
        });
        if (!result.sent) {
          console.error("Mitgliedskarte E-Mail", subscription.id, result.message);
        }
      } catch (error) {
        console.error("Mitgliedskarte E-Mail", subscription.id, error);
      }
    }
  }
}

export type ResendMembershipCardState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function resendMembershipCardAction(
  _prev: ResendMembershipCardState,
  formData: FormData,
): Promise<ResendMembershipCardState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Bitte melden Sie sich an." };
  }

  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) {
    return { ok: false, error: "Mitgliedschaft nicht gefunden." };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });

  if (
    !subscription ||
    (subscription.status !== "ACTIVE" &&
      subscription.status !== "SCHEDULED") ||
    subscription.plan.kind !== "MEMBERSHIP"
  ) {
    return { ok: false, error: "Vereinsmitgliedschaft nicht gefunden." };
  }

  if (
    !(await canActFor(user.id, subscription.userId)) &&
    subscription.purchasedById !== user.id &&
    user.role !== "ADMIN"
  ) {
    return { ok: false, error: "Keine Berechtigung." };
  }

  const result = await sendMembershipCardForSubscription(subscription.id, {
    force: true,
  });

  if (!result.sent) {
    return {
      ok: false,
      error: result.message,
    };
  }

  return {
    ok: true,
    message: "Mitgliedskarte wurde erneut per E-Mail versendet.",
  };
}

