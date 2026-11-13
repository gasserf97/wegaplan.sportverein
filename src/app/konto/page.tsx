import type { Metadata } from "next";
import type { SubscriptionInterval } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipBanner } from "@/components/membership-required";
import { AutoRenewToggle } from "@/components/auto-renew-toggle";
import { MyReservationsList } from "@/components/court-booking";
import {
  MembershipCardView,
  toCardData,
} from "@/components/membership-card-view";
import { CancelEnrollmentButton } from "@/components/cancel-enrollment-button";
import { CancelPendingSubscriptionButton } from "@/components/cancel-pending-subscription-button";
import { AccountDocumentUpload } from "@/components/account-attest-upload";
import { CreditBalanceSection } from "@/components/credit-balance-section";
import { DeleteOwnAccountSection } from "@/components/delete-own-account";
import { FamilyMemberCard } from "@/components/family-member-card";
import { CalendarSyncSection } from "@/components/calendar-sync-section";
import { PwaInstallMenuItem } from "@/components/pwa-install-menu-item";
import { ResendCourseConfirmationButton } from "@/components/resend-course-confirmation-button";
import { ResendMembershipCardButton } from "@/components/resend-membership-card-button";
import { Badge } from "@/components/ui/badge";
import { getAccountTransactions } from "@/lib/account-transactions";
import {
  accountingAmountCents,
  enrollmentCreditRefundCents,
} from "@/lib/payment-amounts";
import {
  canCancelCourseEnrollment,
  courseCancelBlockedMessage,
  coursePeriodEnded,
  isActiveCourseEnrollment,
} from "@/lib/courses";
import {
  courseDocumentRequirements,
  DOCUMENT_KIND_LABELS,
  hasMedicalCertificate,
  missingDocumentKinds,
} from "@/lib/course-documents";
import { getCurrentUser } from "@/lib/auth";
import { householdRootId, listFamily } from "@/lib/family";
import {
  formatBirthDate,
  formatDate,
  formatDateTime,
  formatEuro,
  toDateInputValue,
} from "@/lib/format";
import { membershipPeriodYear } from "@/lib/confirmation-title";
import { getServerI18n } from "@/lib/i18n";
import type { Locale, TFunction } from "@/lib/i18n";
import { calendarFeedUrls } from "@/lib/calendar-feed";
import { formatCourseSchedule } from "@/lib/course-schedule";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/stripe";
import {
  initialSubscriptionPeriod,
  intervalMeta,
  isPendingBankTransfer,
  isSubscriptionPeriodValid,
  joinMetaParts,
  subscriptionStatusMeta,
} from "@/lib/subscriptions";
import { assertClubMembership } from "@/lib/membership";
import { shouldShowMembershipNotices } from "@/lib/membership-notices";
import { expireStalePendingEnrollments, expireStalePendingSubscriptions } from "@/lib/expire-pending";
import { processDueAutoRenewals } from "@/lib/subscription-renewal";
import { processExpiredWaitlistOffers, waitlistOfferUrl } from "@/lib/waitlist";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("account.title") };
}

function subscriptionIntervalPer(t: TFunction, interval: SubscriptionInterval) {
  return intervalMeta(interval, t).per;
}

function pendingPaymentLabel(t: TFunction) {
  return t("courses.catalogBadgePaymentUnconfirmed");
}

export default async function AccountPage() {
  const { locale, t } = await getServerI18n();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/konto");
  }

  await processDueAutoRenewals();
  await processExpiredWaitlistOffers();
  await expireStalePendingSubscriptions();
  await expireStalePendingEnrollments();

  const family = await listFamily(user.id);
  const familyIds = family.map((person) => person.id);
  const nameById = new Map(family.map((person) => [person.id, person.name]));
  const selfPerson = family.find((person) => person.isSelf);
  const rootId = await householdRootId(user.id);
  const isHouseholdRoot = rootId === user.id;
  const minorNames = family
    .filter((person) => !person.isSelf && person.age < 18)
    .map((person) => person.name);

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      taxId: true,
      street: true,
      postalCode: true,
      city: true,
      birthDate: true,
      username: true,
      emailVerifiedAt: true,
      creditBalanceCents: true,
      calendarSyncEnabled: true,
      calendarFeedToken: true,
      calendarSyncTennis: true,
      calendarSyncCourses: true,
      calendarSyncChildCourses: true,
    },
  });
  if (!profile) redirect("/anmelden?next=/konto");

  const [enrollments, reservations, subscriptions, ledger] =
    await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: { in: familyIds } },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            scheduleWeekdays: true,
            scheduleStartMinute: true,
            scheduleEndMinute: true,
            priceCents: true,
            startsAt: true,
            endsAt: true,
            cancelDeadlineDaysBeforeStart: true,
            requiresDocuments: true,
            requiresMedicalCertificate: true,
            requiresPassportPhoto: true,
            requiresIdFront: true,
            requiresIdBack: true,
            requiresHealthCard: true,
          },
        },
        documents: { select: { id: true, kind: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.courtReservation.findMany({
      where: {
        userId: user.id,
        status: "CONFIRMED",
        startsAt: { gte: new Date() },
      },
      include: { court: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.subscription.findMany({
      where: { userId: { in: familyIds } },
      include: {
        plan: true,
        user: { select: { id: true, name: true, username: true, birthDate: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getAccountTransactions(user.id, profile.name),
  ]);
  const membership = await assertClubMembership(user);
  const calendarUrls =
    profile.calendarSyncEnabled && profile.calendarFeedToken
      ? calendarFeedUrls(await getAppUrl(), profile.calendarFeedToken)
      : null;
  const now = new Date();
  const membershipCards = subscriptions
    .filter(
      (item) =>
        (item.status === "ACTIVE" || item.status === "SCHEDULED") &&
        item.plan.kind === "MEMBERSHIP" &&
        (!item.periodEnd || item.periodEnd >= now),
    )
    .sort((a, b) => {
      if (a.userId === user.id && b.userId !== user.id) return -1;
      if (b.userId === user.id && a.userId !== user.id) return 1;
      return 0;
    });

  function periodStamp(
    date: Date,
    interval: SubscriptionInterval,
    asEnd = false,
  ) {
    if (asEnd && interval === "YEARLY_CALENDAR") {
      const year = membershipPeriodYear(null, date) ?? date.getFullYear();
      return `31.12.${year}`;
    }
    return interval === "MINUTELY" || interval === "DAILY"
      ? formatDateTime(date, locale)
      : formatDate(date, locale);
  }

  function periodLabel(item: (typeof subscriptions)[number]) {
    if (item.periodEnd) {
      return t("subscriptions.validityUntil", {
        date: periodStamp(item.periodEnd, item.plan.interval, true),
      });
    }
    if (item.status === "PENDING") {
      const { periodEnd } = initialSubscriptionPeriod(item.plan.interval);
      return t("subscriptions.validityUntilAfterPayment", {
        date: periodStamp(periodEnd, item.plan.interval, true),
      });
    }
    return null;
  }

  function periodSince(item: (typeof subscriptions)[number]) {
    const since = item.periodStart ?? item.paidAt;
    if (!since) return null;
    if (item.status === "SCHEDULED") {
      return t("subscriptions.scheduledFrom", {
        date: periodStamp(since, item.plan.interval),
      });
    }
    return t("subscriptions.validitySince", {
      date: periodStamp(since, item.plan.interval),
    });
  }

  const currentSubscriptions = subscriptions.filter(
    (item) =>
      item.status === "SCHEDULED" ||
      isPendingBankTransfer(item) ||
      (item.status === "ACTIVE" &&
        (!item.periodStart || item.periodStart <= now) &&
        isSubscriptionPeriodValid(item.periodEnd, now)),
  );

  function sortPersonSubscriptions(
    items: (typeof currentSubscriptions)[number][],
  ) {
    return [...items].sort((a, b) => {
      const kindRank = (kind: string) => (kind === "MEMBERSHIP" ? 0 : 1);
      const byKind = kindRank(a.plan.kind) - kindRank(b.plan.kind);
      if (byKind !== 0) return byKind;
      return a.plan.title.localeCompare(b.plan.title, locale);
    });
  }

  const groupedSubscriptions = family
    .map((person) => ({
      id: person.id,
      name: person.name,
      isSelf: person.isSelf,
      items: sortPersonSubscriptions(
        currentSubscriptions.filter((item) => item.userId === person.id),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const groupedIds = new Set(groupedSubscriptions.map((group) => group.id));
  for (const item of currentSubscriptions) {
    if (groupedIds.has(item.userId)) continue;
    groupedSubscriptions.push({
      id: item.userId,
      name: nameById.get(item.userId) ?? item.user.name,
      isSelf: false,
      items: sortPersonSubscriptions(
        currentSubscriptions.filter((row) => row.userId === item.userId),
      ),
    });
    groupedIds.add(item.userId);
  }

  const showPersonHeadings = family.length > 1 || groupedSubscriptions.length > 1;

  const activeEnrollments = enrollments.filter((item) => {
    if (item.status === "CANCELLED") return false;
    if (item.status === "WAITLISTED") return true;
    if (item.status === "PENDING") {
      if (item.waitlistOfferToken) return true;
      if (item.paymentMethod === "BANK_TRANSFER") return true;
      return false;
    }
    return isActiveCourseEnrollment(
      item,
      item.course.requiresMedicalCertificate,
    );
  });
  const currentEnrollments = activeEnrollments.filter(
    (item) => !coursePeriodEnded(item.course, now),
  );
  const pastEnrollments = enrollments
    .filter((item) => {
      if (item.status === "CANCELLED") return true;
      if (item.status === "PAID" && coursePeriodEnded(item.course, now)) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const aAt = a.course.endsAt ?? a.course.startsAt ?? a.paidAt ?? a.createdAt;
      const bAt = b.course.endsAt ?? b.course.startsAt ?? b.paidAt ?? b.createdAt;
      return bAt.getTime() - aAt.getTime();
    });

  const subscriptionList =
    currentSubscriptions.length === 0 ? (
      <p className="mt-4 rounded-xl border border-border bg-card p-8 text-muted-foreground">
        {membership.ok ? (
          t("account.noActiveSubscription")
        ) : (
          <>
            {t("account.noActiveSubscription")}{" "}
            {t("account.noMembershipPrefix")}{" "}
            <Link href="/abos" className="underline">
              {t("common.membership")}
            </Link>{" "}
            {t("account.noMembershipSuffix")}
          </>
        )}
      </p>
    ) : (
      <ul className="mt-4 grid gap-8">
        {groupedSubscriptions.map((group) => (
          <li key={group.id} className="grid gap-3">
            {showPersonHeadings ? (
              <h3 className="text-lg font-medium text-foreground">
                  {group.isSelf
                    ? t("account.subscriptionsForYou", { name: group.name })
                    : group.name}
              </h3>
            ) : null}
            <ul className="grid gap-3">
              {group.items.map((item) => {
          const per = subscriptionIntervalPer(t, item.plan.interval);
          const since = periodSince(item);
          const until = periodLabel(item);
          const line = joinMetaParts([
            `${formatEuro(item.paidCents ?? item.plan.priceCents, locale)} ${per}${
              item.creditAppliedCents > 0
                ? ` · ${t("account.creditOf", {
                    amount: formatEuro(item.creditAppliedCents, locale),
                  })}`
                : ""
            }`,
            subscriptionStatusMeta(t, {
              since,
              until,
              autoRenew:
                item.autoRenew && item.prepaidRenewalCredits <= 0,
              renewDateLabel:
                item.autoRenew &&
                item.prepaidRenewalCredits <= 0 &&
                item.periodEnd
                  ? periodStamp(item.periodEnd, item.plan.interval, true)
                  : null,
            }),
          ]);
          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <Link href={`/abos/${item.plan.id}`} className="font-medium hover:underline">
                  {item.plan.title}
                </Link>
                {line ? (
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {line}
                  </p>
                ) : null}
                {item.prepaidRenewalCredits > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      item.prepaidRenewalCredits === 1
                        ? "account.prepaidRenewalOne"
                        : "account.prepaidRenewalMany",
                      { n: item.prepaidRenewalCredits },
                    )}
                  </p>
                ) : null}
              </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Badge
                    variant={
                      item.status === "ACTIVE" ? "success" : "secondary"
                    }
                  >
                    {item.status === "ACTIVE"
                      ? t("subscriptions.badgeActive")
                      : item.status === "SCHEDULED"
                        ? t("subscriptions.badgeScheduled")
                        : pendingPaymentLabel(t)}
                  </Badge>
                  {item.status === "ACTIVE" ? (
                    <AutoRenewToggle
                      subscriptionId={item.id}
                      autoRenew={item.autoRenew}
                      offered={item.plan.autoRenewOffered}
                    />
                  ) : item.status === "PENDING" ? (
                    <CancelPendingSubscriptionButton
                      subscriptionId={item.id}
                      planTitle={item.plan.title}
                      refundCents={
                        item.paymentMethod === "BANK_TRANSFER" &&
                        item.creditAppliedCents > 0
                          ? item.creditAppliedCents
                          : 0
                      }
                    />
                  ) : null}
                  {item.plan.kind === "MEMBERSHIP" &&
                  (item.status === "ACTIVE" ||
                    item.status === "SCHEDULED") ? (
                    <ResendMembershipCardButton
                      subscriptionId={item.id}
                      compact
                    />
                  ) : null}
                </div>
            </li>
          );
              })}
            </ul>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl">{t("account.title")}</h1>
      <p className="mt-2 text-muted-foreground">
        {profile.name}
        {profile.email ? ` · ${profile.email}` : ""}
      </p>
      {shouldShowMembershipNotices() && !membership.ok ? (
        <div className="mt-6">
          <MembershipBanner href={membership.href} />
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-2xl text-primary">{t("account.profileTitle")}</h2>
        {selfPerson ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("account.familySelfHint")}
          </p>
        ) : null}
        <div className="mt-4 grid min-w-0 gap-3">
          {selfPerson ? (
            <FamilyMemberCard
              memberId={selfPerson.id}
              name={selfPerson.name}
              email={selfPerson.email}
              phone={selfPerson.phone}
              taxId={selfPerson.taxId}
              street={selfPerson.street}
              postalCode={selfPerson.postalCode}
              city={selfPerson.city}
              birthDate={toDateInputValue(selfPerson.birthDate)}
              birthDateLabel={formatBirthDate(selfPerson.birthDate, locale)}
              age={selfPerson.age}
              emailVerified={selfPerson.emailVerified}
              hasMembership={selfPerson.hasMembership}
              isSelf
              canManage
              defaultOpen={false}
            />
          ) : null}
          <CalendarSyncSection
            enabled={profile.calendarSyncEnabled}
            tennis={profile.calendarSyncTennis}
            courses={profile.calendarSyncCourses}
            childCourses={profile.calendarSyncChildCourses}
            hasChild={minorNames.length > 0}
            httpsUrl={calendarUrls?.httpsUrl ?? null}
            webcalUrl={calendarUrls?.webcalUrl ?? null}
            googleUrl={calendarUrls?.googleUrl ?? null}
          />
        </div>
      </section>

      {membershipCards.length > 0 ? (
        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl text-primary">{t("account.membershipCard")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {membershipCards[0].periodEnd
                  ? t("account.validUntil", {
                      date: periodStamp(
                        membershipCards[0].periodEnd,
                        membershipCards[0].plan.interval,
                        true,
                      ),
                    })
                  : t("account.activeMembership")}
              </p>
            </div>
            <Link
              href="/konto/mitgliedskarte"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t("account.printCard")}
            </Link>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {membershipCards.map((item) => (
              <li key={item.id}>
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-2xl text-primary">{t("account.subscriptionsTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("account.subscriptionsHint")}
        </p>
        {subscriptionList}
      </section>

      <section className="mt-8">
        <h2 className="text-2xl text-primary">{t("account.coursesTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("account.coursesHint")}
        </p>

        <h3 className="mt-6 text-lg font-medium">{t("account.currentCourses")}</h3>
        {currentEnrollments.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {t("account.noCourses")}{" "}
            <Link href="/kurse" className="underline">
              {t("account.courseCatalogLink")}
            </Link>
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {currentEnrollments.map((item) => (
              <AccountEnrollmentRow
                key={item.id}
                item={item}
                locale={locale}
                t={t}
                viewerUserId={user.id}
                nameById={nameById}
                allowCancel
              />
            ))}
          </ul>
        )}

        {pastEnrollments.length > 0 ? (
          <details className="group mt-8 rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <h3 className="text-lg font-medium">{t("account.pastCourses")}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("account.pastCoursesHint")}
                </p>
              </div>
              <span
                className="shrink-0 text-sm text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              >
                ▼
              </span>
            </summary>
            <ul className="grid gap-3 border-t border-border px-4 py-3">
              {pastEnrollments.map((item) => (
                <AccountEnrollmentRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  t={t}
                  viewerUserId={user.id}
                  nameById={nameById}
                  allowCancel={false}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <CreditBalanceSection
        balanceCents={profile.creditBalanceCents}
        transactions={ledger}
      />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
        <Link
          href="/konto/familie"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t("account.familyLink", {
            n: family.length,
            label:
              family.length === 1
                ? t("account.familyLinkOne")
                : t("account.familyLinkMany"),
          })}
        </Link>
        <PwaInstallMenuItem className="text-sm text-primary underline-offset-4 hover:underline" />
      </div>

      <h2 className="mt-10 text-2xl text-primary">{t("account.tennisTitle")}</h2>
      <div className="mt-4">
        <MyReservationsList
          reservations={reservations.map((r) => ({
            id: r.id,
            courtName: r.court.name,
            category: r.court.category,
            startsAt: r.startsAt.toISOString(),
            endsAt: r.endsAt.toISOString(),
            status: r.status,
            priceCents: r.priceCents,
            paidAt: r.paidAt?.toISOString() ?? null,
            cancelRefundMinutesBeforeStart: r.court.cancelRefundMinutesBeforeStart,
          }))}
        />
      </div>
      <Link
        href="/tennisplatz"
        className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("account.tennisLink")}
      </Link>

      <DeleteOwnAccountSection
        minorNames={isHouseholdRoot ? minorNames : []}
        isHouseholdRoot={isHouseholdRoot}
      />
    </div>
  );
}

type AccountEnrollmentItem = {
  id: string;
  userId: string;
  status: string;
  paidAt: Date | null;
  paidCents: number | null;
  creditAppliedCents: number;
  waitlistOfferToken: string | null;
  offerExpiresAt: Date | null;
  paymentMethod: "STRIPE" | "BANK_TRANSFER" | null;
  stripeSessionId: string | null;
  confirmationEmailSentAt: Date | null;
  documents: Array<{ id: string; kind: import("@/generated/prisma/client").EnrollmentDocumentKind }>;
  course: {
    id: string;
    title: string;
    scheduleWeekdays: number[];
    scheduleStartMinute: number | null;
    scheduleEndMinute: number | null;
    priceCents: number;
    startsAt: Date | null;
    endsAt: Date | null;
    cancelDeadlineDaysBeforeStart: number | null;
    requiresDocuments: boolean;
    requiresMedicalCertificate: boolean;
    requiresPassportPhoto: boolean;
    requiresIdFront: boolean;
    requiresIdBack: boolean;
    requiresHealthCard: boolean;
  };
};

function AccountEnrollmentRow({
  item,
  locale,
  t,
  viewerUserId,
  nameById,
  allowCancel,
}: {
  item: AccountEnrollmentItem;
  locale: Locale;
  t: TFunction;
  viewerUserId: string;
  nameById: Map<string, string>;
  allowCancel: boolean;
}) {
  const chargedCents = accountingAmountCents(
    item.paidCents,
    item.course.priceCents,
    item.status === "PENDING",
  );
  const enrollmentCanCancel =
    allowCancel &&
    (item.status === "WAITLISTED" ||
      canCancelCourseEnrollment(
        item.course.startsAt,
        item.course.cancelDeadlineDaysBeforeStart,
      ));
  const requirements = courseDocumentRequirements(item.course);
  const missingKinds = missingDocumentKinds(
    requirements.map((item) => item.kind),
    item.documents,
  );
  const missingAttest =
    item.course.requiresMedicalCertificate &&
    !hasMedicalCertificate(item.documents) &&
    item.status !== "CANCELLED";
  const missingMandatory = missingKinds.filter(
    (kind) => kind !== "MEDICAL_CERTIFICATE",
  );
  const scheduleLabel = formatCourseSchedule(
    item.course.scheduleWeekdays,
    item.course.scheduleStartMinute,
    item.course.scheduleEndMinute,
    locale,
  );
  const statusLabel =
    item.status === "CANCELLED"
      ? t("common.cancelled")
      : item.status === "PAID"
        ? t("account.badgePaid")
        : item.status === "WAITLISTED"
          ? t("account.badgeWaitlist")
          : item.waitlistOfferToken && item.offerExpiresAt
            ? t("account.badgeReserved")
            : item.course.requiresMedicalCertificate &&
                hasMedicalCertificate(item.documents) &&
                item.status === "PENDING"
              ? t("account.badgeAttestOkPay")
              : pendingPaymentLabel(t);

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link
          href={`/kurse/${item.course.id}`}
          className="font-medium hover:underline"
        >
          {item.course.title}
        </Link>
        {scheduleLabel ? (
          <p className="text-sm text-muted-foreground">{scheduleLabel}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {item.userId !== viewerUserId
            ? `${nameById.get(item.userId) ?? t("account.familyMember")} · `
            : null}
          {formatEuro(chargedCents, locale)}
          {item.paidAt
            ? ` · ${t("account.paidOn", {
                date: formatDate(item.paidAt, locale),
              })}`
            : null}
          {item.creditAppliedCents > 0
            ? ` · ${t("account.creditOf", {
                amount: formatEuro(item.creditAppliedCents, locale),
              })}`
            : null}
        </p>
        {missingKinds.length > 0 ? (
          <p className="mt-2 text-sm text-orange-700">
            {t("account.uploadAttestHint")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              item.status === "PAID"
                ? "success"
                : item.status === "CANCELLED"
                  ? "secondary"
                  : "secondary"
            }
          >
            {statusLabel}
          </Badge>
          {missingMandatory.map((kind) => (
            <Badge key={kind} variant="warning">
              {DOCUMENT_KIND_LABELS[kind]} fehlt
            </Badge>
          ))}
          {missingAttest ? (
            <Badge variant="warning">{t("account.badgeAttestPending")}</Badge>
          ) : null}
        </div>
        {missingKinds.length > 0 ? (
          <div className="grid w-full max-w-xs gap-3">
            {missingKinds.map((kind) => (
              <div key={kind} className="grid gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {DOCUMENT_KIND_LABELS[kind]}
                </p>
                <AccountDocumentUpload
                  enrollmentId={item.id}
                  kind={kind}
                  uploadingLabel={t("courses.uploading")}
                  uploadFailedLabel={t("errors.courses.uploadFailed")}
                />
              </div>
            ))}
          </div>
        ) : null}
        {item.waitlistOfferToken &&
        item.offerExpiresAt &&
        item.offerExpiresAt > new Date() ? (
          <Link
            href={waitlistOfferUrl(
              item.course.id,
              item.id,
              item.waitlistOfferToken,
            )}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("account.secureSpotUntil", {
              date: formatDateTime(item.offerExpiresAt, locale),
            })}
          </Link>
        ) : null}
        {item.status === "PAID" ? (
          <ResendCourseConfirmationButton
            enrollmentId={item.id}
            alreadySent={Boolean(item.confirmationEmailSentAt)}
          />
        ) : null}
        {allowCancel && item.status !== "CANCELLED" ? (
          <CancelEnrollmentButton
            enrollmentId={item.id}
            courseTitle={item.course.title}
            canCancel={enrollmentCanCancel}
            cancelBlockedMessage={courseCancelBlockedMessage(
              item.course.cancelDeadlineDaysBeforeStart,
              item.course.startsAt,
            )}
            refundCents={
              item.status === "PAID"
                ? enrollmentCreditRefundCents({
                    paidCents: item.paidCents,
                    creditAppliedCents: item.creditAppliedCents,
                    course: item.course,
                  })
                : item.status === "PENDING" &&
                    item.paymentMethod === "BANK_TRANSFER" &&
                    item.creditAppliedCents > 0
                  ? item.creditAppliedCents
                  : 0
            }
            paymentMethod={item.paymentMethod}
            paidByCard={
              item.paymentMethod === "STRIPE" ||
              (item.paymentMethod !== "BANK_TRANSFER" &&
                Boolean(item.stripeSessionId))
            }
            waitlisted={item.status === "WAITLISTED"}
          />
        ) : null}
      </div>
    </li>
  );
}
