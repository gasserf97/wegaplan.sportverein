import type { AdminRecentRegistrationItem } from "@/components/admin-recent-registrations";
import { getAdminRecentSubscriptionTransactionRows } from "@/lib/admin-recent-subscription-transactions";
import { formatDateTime, formatEuro } from "@/lib/format";
import type { Locale, TFunction } from "@/lib/i18n/types";
import { accountingAmountCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { registrationPaymentLabel } from "@/lib/registration-payment";
import type { Prisma } from "@/generated/prisma/client";

function enrollmentStatusLabel(
  status: "PENDING" | "PAID" | "CANCELLED" | "WAITLISTED",
  t: TFunction,
) {
  switch (status) {
    case "PAID":
      return t("common.paid");
    case "CANCELLED":
      return t("common.cancelled");
    case "WAITLISTED":
      return t("admin.enrollmentWaitlist");
    default:
      return t("common.open");
  }
}

async function getAdminCourseEnrollmentRows(
  courseWhere: Prisma.CourseWhereInput | undefined,
  locale: Locale,
  t: TFunction,
): Promise<Array<{ at: Date; item: AdminRecentRegistrationItem }>> {
  const enrollments = await prisma.enrollment.findMany({
    where: courseWhere ? { course: courseWhere } : {},
    include: { user: true, course: true },
    orderBy: [
      { paidAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });

  return enrollments.flatMap((item) => {
    // Wie auf der Kurs-Anmeldungsseite: keine angefangenen/abgebrochenen
    // Checkouts (Dokumente vorbereitet, Stripe abgebrochen, …).
    const incompletePending =
      item.status === "PENDING" && item.paymentMethod !== "BANK_TRANSFER";
    const unpaidCancel = item.status === "CANCELLED" && !item.paidAt;
    if (incompletePending || unpaidCancel) return [];

    // Immer der Zeitpunkt der letzten Statusänderung (Zahlung, Storno, …),
    // nicht das ursprüngliche Buchungsdatum.
    const when = item.statusChangedAt;
    const amountCents = accountingAmountCents(
      item.paidCents,
      item.course.priceCents,
      item.status === "PENDING" || item.status === "WAITLISTED",
    );
    return [
      {
        at: when,
        item: {
          id: `course-${item.id}`,
          personName: item.user.name,
          title: item.course.title,
          statusLabel: enrollmentStatusLabel(item.status, t),
          statusSettled: item.status === "PAID",
          amountLabel: formatEuro(amountCents, locale),
          paymentLabel:
            item.status === "WAITLISTED"
              ? null
              : registrationPaymentLabel(
                  {
                    paymentMethod: item.paymentMethod,
                    creditAppliedCents: item.creditAppliedCents,
                    paidCents: item.paidCents,
                    listPriceCents: item.course.priceCents,
                    bankTransferApprovedAt: item.bankTransferApprovedAt,
                    stripeSessionId: item.stripeSessionId,
                    settled: item.status === "PAID",
                  },
                  t,
                ),
          whenLabel: formatDateTime(when, locale),
        },
      },
    ];
  });
}

/** Alle Kurs-Anmeldungen (volle Historie), neueste zuerst. */
export async function getAdminCourseRegistrations(options: {
  courseWhere?: Prisma.CourseWhereInput;
  locale: Locale;
  t: TFunction;
}): Promise<AdminRecentRegistrationItem[]> {
  const rows = await getAdminCourseEnrollmentRows(
    options.courseWhere,
    options.locale,
    options.t,
  );
  return rows
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((row) => row.item);
}

/** Alle Mitgliedschafts-Anmeldungen und Zahlungen (volle Historie), neueste zuerst. */
export async function getAdminSubscriptionRegistrations(options: {
  subscriptionWhere?: Prisma.SubscriptionWhereInput;
  locale: Locale;
  t: TFunction;
}): Promise<AdminRecentRegistrationItem[]> {
  const rows = await getAdminRecentSubscriptionTransactionRows(
    options.subscriptionWhere ?? {},
    options.locale,
    options.t,
    Number.MAX_SAFE_INTEGER,
  );
  return rows
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((row) => row.item);
}

/** Alle Kurs- und Abo-Anmeldungen (volle Historie), neueste zuerst. */
export async function getAdminAllRegistrations(options: {
  courseWhere?: Prisma.CourseWhereInput;
  subscriptionWhere?: Prisma.SubscriptionWhereInput;
  locale: Locale;
  t: TFunction;
}): Promise<AdminRecentRegistrationItem[]> {
  const { courseWhere, subscriptionWhere = {}, locale, t } = options;

  const [courseRows, subscriptionRows] = await Promise.all([
    getAdminCourseEnrollmentRows(courseWhere, locale, t),
    getAdminRecentSubscriptionTransactionRows(
      subscriptionWhere,
      locale,
      t,
      Number.MAX_SAFE_INTEGER,
    ),
  ]);

  return [...courseRows, ...subscriptionRows]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((row) => row.item);
}
