import type { TFunction, Locale } from "@/lib/i18n/types";
import { localeToIntlTag } from "@/lib/i18n/intl";
import { getTranslator } from "@/lib/i18n/translator";
import {
  accountingAmountCents,
} from "@/lib/payment-amounts";
import { resolveStripeFeeCents } from "@/lib/stripe-fees";
import { getUserAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { MEMBERSHIP_NOTICES_FROM_MS } from "@/lib/membership-notices";
import { currentlyValidSubscriptionFilter } from "@/lib/subscriptions";
import { formatSlotDate, formatSlotTime } from "@/lib/booking";
import { reservationBookerName } from "@/lib/court-booking";
import { loadConfirmedCashRefundKeys } from "@/lib/pending-refund";
import { ALL_SECTIONS, type AccountingSection } from "@/lib/accounting-shared";
import {
  accountingPeriodRange,
  isDateInAccountingPeriod,
  parseAccountingPeriodKey,
  type AccountingPeriodKey,
} from "@/lib/accounting-shared";
import { sectionListOrderBy } from "@/lib/section-order";
export {
  ALL_SECTIONS,
  ALL_TIME,
  ACCOUNTING_PERIOD_KEYS,
  accountingHref,
  parseAccountingPeriodKey,
  type AccountingPeriodKey,
  type AccountingSection,
} from "@/lib/accounting-shared";

export type AccountingKind = "course" | "membership" | "addon" | "court" | "device";

export type AccountingPlanPricingMode = "PER_PERSON" | "FAMILY_BUNDLE";

export type AccountingPayment = {
  id: string;
  kind: AccountingKind;
  title: string;
  sectionId: string | null;
  sectionName: string;
  memberName: string;
  payerName: string | null;
  amountCents: number;
  status: "PAID" | "PENDING" | "CANCELLED" | "REFUNDED";
  paidAt: Date | null;
  createdAt: Date;
  paymentMethod: "STRIPE" | "BANK_TRANSFER" | null;
  paymentReference: string | null;
  bankTransferApprovedAt: Date | null;
  approveKind: "course" | "subscription" | null;
  approveId: string | null;
  confirmedBy: string | null;
  paymentSource?: string | null;
  planPricingMode?: AccountingPlanPricingMode | null;
  creditAppliedCents: number;
  stripeFeeCents?: number | null;
  stripeSessionId?: string | null;
  stripeSubscriptionId?: string | null;
  /** Tennis: Kartenbetrag wurde bereits über Stripe erstattet. */
  cardRefundedAt?: Date | null;
  subscriptionId?: string | null;
  /** Teilnehmer bzw. Buchender. Leer bei Tennis-Gästen. */
  bookerUserId?: string | null;
};

export type BankTransferRow = {
  paymentReference: string;
  /** Tatsächlich zu überweisender / eingegangener Betrag (ohne Guthaben). */
  amountCents: number;
  /** Summe der Buchungspreise (kann höher sein als amountCents bei Guthaben). */
  bookingCents: number;
  creditAppliedCents: number;
  createdAt: Date;
  approvedAt: Date | null;
  pending: boolean;
  items: AccountingPayment[];
  approveKind: "course" | "subscription";
  approveId: string;
};

export type AccountingMonth = {
  key: string;
  label: string;
  paidCents: number;
};

export type AccountingBreakdown = {
  key: string;
  label: string;
  paidCents: number;
  pendingCents: number;
  paidCount: number;
};

export type AccountingMemberCounts = {
  membershipCount: number;
  tennisCount: number;
};

export type IncomingPaymentBreakdown = {
  stripeCount: number;
  stripeCents: number;
  stripeFeeCents: number;
  stripeNetCents: number;
  stripeFeeEstimatedCount: number;
  bankTransferCount: number;
  bankTransferCents: number;
};

export type PendingRefundAccountingRow = {
  id: string;
  kind: "course" | "device" | "subscription" | "court";
  title: string;
  sectionId: string | null;
  sectionName: string;
  memberName: string;
  payerName: string | null;
  paymentMethod: "STRIPE" | "BANK_TRANSFER" | null;
  externalCents: number;
  stripeFeeCents: number;
  payoutCents: number;
  creditedCents: number;
  createdAt: Date;
};

export type AccountingReport = {
  isGlobalAdmin: boolean;
  allowClubWide: boolean;
  allowCombined: boolean;
  sections: AccountingSection[];
  selectedKey: string;
  selectedLabel: string;
  periodKey: AccountingPeriodKey;
  paidCents: number;
  pendingCents: number;
  paidCount: number;
  pendingCount: number;
  pendingRefundCents: number;
  pendingRefundCount: number;
  incomingByMethod: IncomingPaymentBreakdown;
  memberCounts: AccountingMemberCounts;
  bySection: AccountingBreakdown[];  byKind: AccountingBreakdown[];
  months: AccountingMonth[];
  /** Alle eingegangenen Zahlungen (aktiv und storniert). */
  incoming: AccountingPayment[];
  open: AccountingPayment[];
  failed: AccountingPayment[];
  bankTransfers: BankTransferRow[];
  pendingRefunds: PendingRefundAccountingRow[];
  /** Eingegangene Tennis- und Kursbuchungen ab 01.01.2027 ohne Vereinsmitgliedschaft. */
  withoutMembership: AccountingPayment[];
  withoutMembershipCents: number;
  withoutMembershipCount: number;
};

export async function getAccountingAccess(userId: string) {
  const access = await getUserAccess(userId);
  const sections = access.isGlobalAdmin
    ? await prisma.section.findMany({
        orderBy: sectionListOrderBy,
        select: { id: true, name: true },
      })
    : await prisma.section.findMany({
        where: { id: { in: access.sectionAdminIds } },
        orderBy: sectionListOrderBy,
        select: { id: true, name: true },
      });

  return {
    isGlobalAdmin: access.isGlobalAdmin,
    sections,
    allowClubWide: access.isGlobalAdmin,
    allowCombined: access.isGlobalAdmin || sections.length > 1,
  };
}

function resolveSelection(
  requested: string | undefined,
  access: Awaited<ReturnType<typeof getAccountingAccess>>,
) {
  if (requested && requested !== ALL_SECTIONS) {
    const match = access.sections.find((section) => section.id === requested);
    if (match) {
      return {
        key: match.id,
        label: match.name,
        sectionIds: [match.id] as string[] | null,
      };
    }
  }

  if (access.isGlobalAdmin) {
    return {
      key: ALL_SECTIONS,
      label: "Ganzer Verein",
      sectionIds: null as string[] | null,
    };
  }

  return {
    key: ALL_SECTIONS,
    label:
      access.sections.length === 1
        ? access.sections[0].name
        : "Alle meine Sektionen",
    sectionIds: access.sections.map((section) => section.id),
  };
}

function sectionWhere(sectionIds: string[] | null) {
  if (sectionIds === null) return {};
  if (sectionIds.length === 0) return { sectionId: { in: ["__none__"] } };
  return { sectionId: { in: sectionIds } };
}

function kindLabel(kind: AccountingKind, t: TFunction) {
  if (kind === "course") return t("accounting.kindCourses");
  if (kind === "membership") return t("accounting.kindMemberships");
  if (kind === "court") return t("accounting.kindCourts");
  if (kind === "device") return t("accounting.kindFleet");
  return t("accounting.kindAddons");
}

export function paymentPersonLabel(
  memberName: string,
  payerName: string | null,
  t: TFunction,
) {
  if (payerName && payerName !== memberName) {
    return t("accounting.personFor", { payer: payerName, member: memberName });
  }
  return memberName;
}

function monthsForPeriod(
  periodKey: AccountingPeriodKey,
  now = new Date(),
  locale: Locale = "de",
): AccountingMonth[] {
  const months: AccountingMonth[] = [];
  const pushMonth = (date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: new Intl.DateTimeFormat(localeToIntlTag(locale), {
        month: "short",
        year: "2-digit",
      }).format(date),
      paidCents: 0,
    });
  };

  if (periodKey === "dieses-jahr") {
    const endMonth =
      now.getFullYear() === new Date().getFullYear() ? now.getMonth() : 11;
    for (let month = 0; month <= endMonth; month += 1) {
      pushMonth(new Date(now.getFullYear(), month, 1));
    }
    return months;
  }

  if (periodKey === "letztes-jahr") {
    const year = now.getFullYear() - 1;
    for (let month = 0; month < 12; month += 1) {
      pushMonth(new Date(year, month, 1));
    }
    return months;
  }

  if (periodKey === "dieser-monat") {
    pushMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    return months;
  }

  if (periodKey === "letzter-monat") {
    pushMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    return months;
  }

  if (periodKey === "dieses-quartal") {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    for (let month = quarterStart; month <= now.getMonth(); month += 1) {
      pushMonth(new Date(now.getFullYear(), month, 1));
    }
    return months;
  }

  if (periodKey === "letztes-quartal") {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3 - 3;
    for (let offset = 0; offset < 3; offset += 1) {
      pushMonth(new Date(now.getFullYear(), quarterStart + offset, 1));
    }
    return months;
  }

  // "alle" und "letzte-12-monate": gleitende 12 Monate
  for (let offset = 11; offset >= 0; offset -= 1) {
    pushMonth(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  }
  return months;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function paymentEventDate(item: { paidAt: Date | null; createdAt: Date }) {
  return item.paidAt ?? item.createdAt;
}

function isOpenBankTransfer(item: AccountingPayment) {
  return item.status === "PENDING" && item.paymentMethod === "BANK_TRANSFER";
}

/** Abgebrochene / nie abgeschlossene Kartenzahlungen (nicht offene Überweisungen). */
function isFailedPayment(item: AccountingPayment) {
  if (item.status === "CANCELLED") return true;
  if (item.status !== "PENDING") return false;
  if (item.paymentMethod === "BANK_TRANSFER") return false;
  return (
    item.paymentMethod === "STRIPE" || Boolean(item.stripeSessionId)
  );
}

function paymentWasReceived(status: AccountingPayment["status"]) {
  return status === "PAID" || status === "REFUNDED";
}

/** Anteil Karte/Überweisung (ohne Guthaben) – für Kontoabgleich. */
export function paymentExternalCents(item: AccountingPayment): number {
  return Math.max(0, item.amountCents - item.creditAppliedCents);
}

/** Für Kontoabgleich: jede Buchung, bei der Geld eingegangen ist (auch wenn später storniert). */
function countsTowardCashReconciliation(status: AccountingPayment["status"]) {
  return status === "PAID" || status === "REFUNDED";
}

function incomingPaymentChannel(
  item: AccountingPayment,
): "stripe" | "bank_transfer" | "other" {
  if (item.paymentMethod === "BANK_TRANSFER") return "bank_transfer";
  if (item.paymentMethod === "STRIPE") return "stripe";
  if (item.stripeSessionId) return "stripe";
  if (item.stripeSubscriptionId) return "stripe";
  if (item.paymentSource === "bank_transfer") return "bank_transfer";
  if (
    item.paymentSource === "checkout" ||
    item.paymentSource === "renewal" ||
    item.paymentSource === "stripe_invoice" ||
    item.paymentSource === "demo"
  ) {
    return "stripe";
  }
  return "other";
}

/** Guthabenanteil gilt nur bei Erstzahlung eines Abos, nicht bei Verlängerungen. */
function subscriptionPaymentCreditApplied(
  source: string | null | undefined,
  subscriptionCreditAppliedCents: number,
): number {
  if (source === "checkout" || source === "bank_transfer") {
    return Math.max(0, subscriptionCreditAppliedCents);
  }
  return 0;
}

function summarizeCashReconciliation(
  items: AccountingPayment[],
): IncomingPaymentBreakdown {
  const summary: IncomingPaymentBreakdown = {
    stripeCount: 0,
    stripeCents: 0,
    stripeFeeCents: 0,
    stripeNetCents: 0,
    stripeFeeEstimatedCount: 0,
    bankTransferCount: 0,
    bankTransferCents: 0,
  };

  for (const item of items) {
    const channel = incomingPaymentChannel(item);
    const external = paymentExternalCents(item);
    if (external <= 0) continue;
    if (channel === "stripe") {
      const { feeCents, estimated } = resolveStripeFeeCents(
        external,
        item.stripeFeeCents,
      );
      summary.stripeCount += 1;
      summary.stripeCents += external;
      summary.stripeFeeCents += feeCents;
      summary.stripeNetCents += external - feeCents;
      if (estimated) summary.stripeFeeEstimatedCount += 1;
    } else if (channel === "bank_transfer") {
      summary.bankTransferCount += 1;
      summary.bankTransferCents += external;
    }
  }

  return summary;
}

function addBreakdown(
  map: Map<string, AccountingBreakdown>,
  key: string,
  label: string,
  amountCents: number,
  paid: boolean,
) {
  const current = map.get(key) ?? {
    key,
    label,
    paidCents: 0,
    pendingCents: 0,
    paidCount: 0,
  };
  if (paid) {
    current.paidCents += amountCents;
    current.paidCount += 1;
  } else {
    current.pendingCents += amountCents;
  }
  map.set(key, current);
}

function courseEnrollmentAccountingStatus(item: {
  status: string;
  paidAt: Date | null;
}): AccountingPayment["status"] {
  if (item.status === "PAID") return "PAID";
  if (item.status === "PENDING") return "PENDING";
  if (item.status === "CANCELLED" && item.paidAt != null) return "REFUNDED";
  return "CANCELLED";
}

function subscriptionAccountingStatus(item: {
  status: string;
  paidAt: Date | null;
}): AccountingPayment["status"] {
  if (item.status === "ACTIVE") return "PAID";
  if (item.status === "PENDING") return "PENDING";
  // Folgemitgliedschaft aus Kurs: vorgemerkt, keine Zahlung – nicht als Fehlschlag.
  if (item.status === "SCHEDULED") return "PAID";
  if (item.status === "CANCELLED" && item.paidAt != null) return "REFUNDED";
  return "CANCELLED";
}

function reservationAccountingStatus(
  status: "CONFIRMED" | "PENDING" | "CANCELLED",
  paidAt: Date | null,
): AccountingPayment["status"] {
  if (status === "CONFIRMED") return "PAID";
  if (status === "PENDING") return "PENDING";
  if (paidAt != null) return "REFUNDED";
  return "CANCELLED";
}

function reservationSlotTitle(
  assetName: string,
  startsAt: Date,
  endsAt: Date,
) {
  return `${assetName} · ${formatSlotDate(startsAt)} ${formatSlotTime(startsAt)}–${formatSlotTime(endsAt)}`;
}

function planSectionWhere(sectionIds: string[] | null) {
  if (sectionIds === null) return {};
  if (sectionIds.length === 0) return { sectionId: { in: ["__none__"] } };
  return { sectionId: { in: sectionIds } };
}

async function loadMemberCounts(
  sectionIds: string[] | null,
  now = new Date(),
): Promise<AccountingMemberCounts> {
  const valid = currentlyValidSubscriptionFilter(now);
  const sectionFilter = planSectionWhere(sectionIds);

  function activePaidWhere(kind: "MEMBERSHIP" | "ADDON") {
    return {
      AND: [
        valid,
        { OR: [{ paidAt: { not: null } }, { payments: { some: {} } }] },
        { plan: { kind, ...sectionFilter } },
      ],
    };
  }

  const [membershipRows, tennisRows] = await Promise.all([
    prisma.subscription.findMany({
      where: activePaidWhere("MEMBERSHIP"),
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.subscription.findMany({
      where: activePaidWhere("ADDON"),
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  return {
    membershipCount: membershipRows.length,
    tennisCount: tennisRows.length,
  };
}

export async function loadAccountingReport(
  userId: string,
  requestedSection?: string,
  locale: Locale = "de",
  requestedPeriod?: string,
): Promise<AccountingReport> {
  const t = getTranslator(locale);
  const access = await getAccountingAccess(userId);
  const selection = resolveSelection(requestedSection, access);
  const periodKey = parseAccountingPeriodKey(requestedPeriod);
  const periodRange = accountingPeriodRange(periodKey);
  const where = sectionWhere(selection.sectionIds);

  const [enrollments, subscriptions, subscriptionPayments, courtReservations, deviceReservations, memberCounts, confirmedRefunds, pendingRefundRows, accountingExclusions, clubMemberships] =
    await Promise.all([
    prisma.enrollment.findMany({
      where:
        selection.sectionIds === null
          ? {}
          : {
              OR: [
                { course: where },
                { course: { bundledPlan: where } },
              ],
            },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        status: true,
        paidAt: true,
        paidCents: true,
        creditAppliedCents: true,
        stripeFeeCents: true,
        cardRefundedAt: true,
        createdAt: true,
        paymentMethod: true,
        paymentReference: true,
        stripeSessionId: true,
        bankTransferApprovedAt: true,
        bankTransferApprovedById: true,
        user: { select: { name: true } },
        purchasedBy: { select: { name: true } },
        course: {
          select: {
            title: true,
            priceCents: true,
            sectionId: true,
            section: { select: { name: true } },
            bundledPlan: {
              select: {
                title: true,
                kind: true,
                sectionId: true,
                section: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.subscription.findMany({
      where: { plan: where },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        paidAt: true,
        createdAt: true,
        paidCents: true,
        creditAppliedCents: true,
        paymentMethod: true,
        paymentReference: true,
        stripeSubscriptionId: true,
        bankTransferApprovedAt: true,
        bankTransferApprovedById: true,
        user: { select: { name: true } },
        purchasedBy: { select: { name: true } },
        plan: {
          select: {
            title: true,
            priceCents: true,
            kind: true,
            pricingMode: true,
            sectionId: true,
            section: { select: { name: true } },
          },
        },
      },
    }),
    prisma.subscriptionPayment.findMany({
      where: { subscription: { plan: where } },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        subscriptionId: true,
        amountCents: true,
        paidAt: true,
        source: true,
        stripeFeeCents: true,
        subscription: {
          select: {
            status: true,
            createdAt: true,
            creditAppliedCents: true,
            bankTransferApprovedById: true,
            user: { select: { name: true } },
            purchasedBy: { select: { name: true } },
            plan: {
              select: {
                title: true,
                kind: true,
                pricingMode: true,
                sectionId: true,
                section: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.courtReservation.findMany({
      where: { priceCents: { gt: 0 }, court: where },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        status: true,
        paidAt: true,
        priceCents: true,
        creditAppliedCents: true,
        stripeFeeCents: true,
        createdAt: true,
        stripeSessionId: true,
        cardRefundedAt: true,
        startsAt: true,
        endsAt: true,
        guestName: true,
        user: { select: { name: true } },
        court: {
          select: {
            name: true,
            sectionId: true,
            section: { select: { name: true } },
          },
        },
      },
    }),
    prisma.deviceReservation.findMany({
      where: { priceCents: { gt: 0 }, device: where },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        paidAt: true,
        priceCents: true,
        creditAppliedCents: true,
        stripeFeeCents: true,
        createdAt: true,
        stripeSessionId: true,
        startsAt: true,
        endsAt: true,
        user: { select: { name: true } },
        device: {
          select: {
            name: true,
            sectionId: true,
            section: { select: { name: true } },
          },
        },
      },
    }),
    loadMemberCounts(selection.sectionIds),
    loadConfirmedCashRefundKeys(),
    prisma.pendingRefundTransfer.findMany({
      where: {
        status: "PENDING",
        ...(selection.sectionIds
          ? { sectionId: { in: selection.sectionIds } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.accountingExclusion.findMany({
      select: { paymentKey: true },
    }),
    prisma.subscription.findMany({
      where: {
        paidAt: { not: null },
        status: { not: "PENDING" },
        plan: { kind: "MEMBERSHIP" },
      },
      select: {
        userId: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
      },
    }),
  ]);

  const approverIds = [
    ...enrollments.map((item) => item.bankTransferApprovedById),
    ...subscriptions.map((item) => item.bankTransferApprovedById),
    ...subscriptionPayments.map(
      (item) => item.subscription.bankTransferApprovedById,
    ),
  ].filter((id): id is string => Boolean(id));

  const approvers =
    approverIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...new Set(approverIds)] } },
          select: { id: true, name: true },
        })
      : [];
  const approverNames = new Map(approvers.map((user) => [user.id, user.name]));

  function resolveConfirmedBy(
    paymentMethod: "STRIPE" | "BANK_TRANSFER" | null,
    approverId: string | null | undefined,
    paid: boolean,
    source?: string,
  ): string | null {
    if (!paid) return null;
    if (paymentMethod === "BANK_TRANSFER" || source === "bank_transfer") {
      if (approverId) {
        return approverNames.get(approverId) ?? "Unbekannt";
      }
      return "System";
    }
    return "System";
  }

  function enrollmentAmountCents(item: (typeof enrollments)[number]) {
    const pending = item.status === "PENDING";
    const wasPaid =
      item.status === "PAID" ||
      (item.status === "CANCELLED" && item.paidAt != null);
    if (!wasPaid && !pending) return 0;
    return accountingAmountCents(
      item.paidCents,
      item.course.priceCents,
      pending,
    );
  }

  function subscriptionAmountCents(item: (typeof subscriptions)[number]) {
    const pending = item.status === "PENDING";
    const wasPaid =
      item.status === "ACTIVE" ||
      (item.status === "CANCELLED" && item.paidAt != null);
    if (!wasPaid && !pending) return 0;
    return accountingAmountCents(item.paidCents, item.plan.priceCents, pending);
  }

  function reservationAmountCents(
    priceCents: number,
    _creditAppliedCents: number,
    pending: boolean,
    wasPaid: boolean,
  ) {
    if (!wasPaid && !pending) return 0;
    return priceCents;
  }

  const idsWithInitialPayment = new Set(
    subscriptionPayments
      .filter(
        (item) =>
          item.source === "checkout" || item.source === "bank_transfer",
      )
      .map((item) => item.subscriptionId),
  );
  const latestPaymentIds = new Set<string>();
  const seenPaymentSubscriptions = new Set<string>();
  for (const payment of subscriptionPayments) {
    if (seenPaymentSubscriptions.has(payment.subscriptionId)) continue;
    seenPaymentSubscriptions.add(payment.subscriptionId);
    latestPaymentIds.add(payment.id);
  }

  /** Kurs mit Folgemitgliedschaft: der bezahlte Kursbetrag zählt als diese Mitgliedschaft. */
  function enrollmentBooksAs(item: (typeof enrollments)[number]) {
    const plan = item.course.bundledPlan;
    if (!plan) {
      return {
        kind: "course" as const,
        title: item.course.title,
        sectionId: item.course.sectionId,
        sectionName: item.course.section?.name ?? "Ohne Sektion",
      };
    }
    return {
      kind: (plan.kind === "MEMBERSHIP" ? "membership" : "addon") as AccountingKind,
      title: plan.title,
      sectionId: plan.sectionId,
      sectionName: plan.section?.name ?? "Ohne Sektion",
    };
  }

  function includeEnrollment(item: (typeof enrollments)[number]) {
    if (selection.sectionIds === null || !item.course.bundledPlan) return true;
    const sectionId = enrollmentBooksAs(item).sectionId;
    if (!sectionId) return false;
    return selection.sectionIds.includes(sectionId);
  }

  const payments: AccountingPayment[] = [
    ...enrollments.filter(includeEnrollment).map((item) => {
      const booked = enrollmentBooksAs(item);
      return {
        id: `course-${item.id}`,
        kind: booked.kind,
        title: booked.title,
        sectionId: booked.sectionId,
        sectionName: booked.sectionName,
        memberName: item.user.name,
        payerName: item.purchasedBy?.name ?? null,
        amountCents: enrollmentAmountCents(item),
        status: courseEnrollmentAccountingStatus(item),
        paidAt: item.paidAt,
        createdAt: item.createdAt,
        paymentMethod: item.paymentMethod,
        paymentReference: item.paymentReference,
        bankTransferApprovedAt: item.bankTransferApprovedAt,
        approveKind: "course" as const,
        approveId: item.id,
        confirmedBy: resolveConfirmedBy(
          item.paymentMethod,
          item.bankTransferApprovedById,
          item.status === "PAID" ||
            (item.status === "CANCELLED" && item.paidAt != null),
        ),
        creditAppliedCents: item.creditAppliedCents,
        stripeFeeCents: item.stripeFeeCents,
        stripeSessionId: item.stripeSessionId,
        cardRefundedAt: item.cardRefundedAt,
        bookerUserId: booked.kind === "course" ? item.userId : null,
      };
    }),
    ...subscriptions
      .filter(
        (item) =>
          // Vorgemerkte Folgemitgliedschaften sind keine Zahlungsversuche.
          item.status !== "SCHEDULED" && !idsWithInitialPayment.has(item.id),
      )
      .map((item) => ({
      id: `plan-${item.id}`,
      kind: (item.plan.kind === "MEMBERSHIP"
        ? "membership"
        : "addon") as AccountingKind,
      title: item.plan.title,
      sectionId: item.plan.sectionId,
      sectionName: item.plan.section?.name ?? "Ohne Sektion",
      memberName: item.user.name,
      payerName: item.purchasedBy?.name ?? null,
      amountCents: subscriptionAmountCents(item),
      status: subscriptionAccountingStatus(item),
      paidAt: item.paidAt,
      createdAt: item.createdAt,
      paymentMethod: item.paymentMethod,
      paymentReference: item.paymentReference,
      bankTransferApprovedAt: item.bankTransferApprovedAt,
      approveKind: "subscription" as const,
      approveId: item.id,
      confirmedBy: resolveConfirmedBy(
        item.paymentMethod,
        item.bankTransferApprovedById,
        item.status === "ACTIVE" ||
          (item.status === "CANCELLED" && item.paidAt != null),
      ),
      planPricingMode: item.plan.pricingMode,
      creditAppliedCents: item.creditAppliedCents,
      stripeSubscriptionId: item.stripeSubscriptionId,
    })),
    ...subscriptionPayments.map((item) => {
      const creditApplied = subscriptionPaymentCreditApplied(
        item.source,
        item.subscription.creditAppliedCents,
      );
      return {
        id: `plan-pay-${item.id}`,
        kind: (item.subscription.plan.kind === "MEMBERSHIP"
          ? "membership"
          : "addon") as AccountingKind,
        title:
          item.source === "renewal" || item.source === "stripe_invoice"
            ? `${item.subscription.plan.title} (Verlängerung)`
            : item.subscription.plan.title,
        sectionId: item.subscription.plan.sectionId,
        sectionName: item.subscription.plan.section?.name ?? "Ohne Sektion",
        memberName: item.subscription.user.name,
        payerName: item.subscription.purchasedBy?.name ?? null,
        amountCents: item.amountCents + creditApplied,
        status:
          item.subscription.status === "CANCELLED" &&
          latestPaymentIds.has(item.id)
            ? ("REFUNDED" as const)
            : ("PAID" as const),
        paidAt: item.paidAt,
        createdAt: item.paidAt,
        paymentMethod: null,
        paymentReference: null,
        bankTransferApprovedAt: null,
        approveKind: null,
        approveId: null,
        confirmedBy: resolveConfirmedBy(
          null,
          item.subscription.bankTransferApprovedById,
          true,
          item.source,
        ),
        planPricingMode: item.subscription.plan.pricingMode,
        creditAppliedCents: creditApplied,
        stripeFeeCents: item.stripeFeeCents,
        paymentSource: item.source,
        subscriptionId: item.subscriptionId,
      };
    }),
    ...courtReservations.map((item) => ({
      id: `court-${item.id}`,
      kind: "court" as const,
      title: reservationSlotTitle(item.court.name, item.startsAt, item.endsAt),
      sectionId: item.court.sectionId,
      sectionName: item.court.section?.name ?? "Ohne Sektion",
      memberName: reservationBookerName(item),
      payerName: null,
      amountCents: reservationAmountCents(
        item.priceCents,
        item.creditAppliedCents,
        item.status === "PENDING",
        item.status === "CONFIRMED" ||
          (item.status === "CANCELLED" && item.paidAt != null),
      ),
      status: reservationAccountingStatus(item.status, item.paidAt),
      paidAt: item.paidAt,
      createdAt: item.createdAt,
      paymentMethod: item.stripeSessionId ? ("STRIPE" as const) : null,
      paymentReference: null,
      bankTransferApprovedAt: null,
      approveKind: null,
      approveId: null,
      confirmedBy:
        item.status === "CONFIRMED" ||
        (item.status === "CANCELLED" && item.paidAt != null)
          ? "System"
          : null,
      creditAppliedCents: item.creditAppliedCents,
      stripeFeeCents: item.stripeFeeCents,
      stripeSessionId: item.stripeSessionId,
      cardRefundedAt: item.cardRefundedAt,
      bookerUserId: item.userId,
    })),
    ...deviceReservations.map((item) => ({
      id: `device-${item.id}`,
      kind: "device" as const,
      title: reservationSlotTitle(item.device.name, item.startsAt, item.endsAt),
      sectionId: item.device.sectionId,
      sectionName: item.device.section?.name ?? "Ohne Sektion",
      memberName: item.user.name,
      payerName: null,
      amountCents: reservationAmountCents(
        item.priceCents,
        item.creditAppliedCents,
        item.status === "PENDING",
        item.status === "CONFIRMED" ||
          (item.status === "CANCELLED" && item.paidAt != null),
      ),
      status: reservationAccountingStatus(item.status, item.paidAt),
      paidAt: item.paidAt,
      createdAt: item.createdAt,
      paymentMethod: item.stripeSessionId ? ("STRIPE" as const) : null,
      paymentReference: null,
      bankTransferApprovedAt: null,
      approveKind: null,
      approveId: null,
      confirmedBy:
        item.status === "CONFIRMED" ||
        (item.status === "CANCELLED" && item.paidAt != null)
          ? "System"
          : null,
      creditAppliedCents: item.creditAppliedCents,
      stripeFeeCents: item.stripeFeeCents,
      stripeSessionId: item.stripeSessionId,
    })),
  ];

  const excludedPaymentKeys = new Set(
    accountingExclusions.map((row) => row.paymentKey),
  );
  const visiblePayments = payments.filter(
    (item) => !excludedPaymentKeys.has(item.id),
  );

  function inSelectedPeriod(date: Date) {
    return isDateInAccountingPeriod(date, periodRange);
  }

  const datedPayments = visiblePayments.filter((item) =>
    inSelectedPeriod(paymentEventDate(item)),
  );

  const bankTransferGroups = new Map<string, AccountingPayment[]>();
  for (const item of datedPayments) {
    if (item.paymentMethod !== "BANK_TRANSFER" || !item.paymentReference) continue;
    const group = bankTransferGroups.get(item.paymentReference) ?? [];
    group.push(item);
    bankTransferGroups.set(item.paymentReference, group);
  }

  // Offene Überweisungen immer anzeigen (aktueller Handlungsbedarf).
  for (const item of visiblePayments) {
    if (!isOpenBankTransfer(item) || !item.paymentReference) continue;
    if (bankTransferGroups.has(item.paymentReference)) continue;
    bankTransferGroups.set(item.paymentReference, [item]);
  }

  const bankTransfers: BankTransferRow[] = [...bankTransferGroups.entries()].map(
    ([paymentReference, items]) => {
      const pending = items.some((item) => item.status === "PENDING");
      const approvedAt = items.reduce<Date | null>((latest, item) => {
        if (!item.bankTransferApprovedAt) return latest;
        if (!latest || item.bankTransferApprovedAt > latest) {
          return item.bankTransferApprovedAt;
        }
        return latest;
      }, null);
      const first = items[0];
      const bookingCents = items.reduce((sum, item) => sum + item.amountCents, 0);
      const creditAppliedCents = items.reduce(
        (sum, item) => sum + Math.max(0, item.creditAppliedCents),
        0,
      );
      return {
        paymentReference,
        amountCents: items.reduce(
          (sum, item) => sum + paymentExternalCents(item),
          0,
        ),
        bookingCents,
        creditAppliedCents,
        createdAt: items.reduce(
          (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
          items[0].createdAt,
        ),
        approvedAt,
        pending,
        items,
        approveKind: first.approveKind ?? "course",
        approveId: first.approveId ?? "",
      };
    },
  );

  bankTransfers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const incoming = datedPayments
    .filter((item) => paymentWasReceived(item.status))
    .sort(
      (a, b) =>
        paymentEventDate(b).getTime() - paymentEventDate(a).getTime(),
    );
  const open = visiblePayments
    .filter(isOpenBankTransfer)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const failed = datedPayments
    .filter(isFailedPayment)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const cashReconciliationItems = incoming.filter((item) => {
    if (!countsTowardCashReconciliation(item.status)) return false;
    // Bestätigte Rückerstattungen abziehen (Eintrag nicht mehr unter „Zurückzuweisen“).
    // Offenes Guthaben / ausstehende Rücküberweisung: Zahlung bleibt in den Einnahmen.
    if (item.status !== "REFUNDED") return true;
    if (item.id.startsWith("course-")) {
      if (item.cardRefundedAt) return false;
      const enrollmentId = item.id.slice("course-".length);
      return !confirmedRefunds.enrollmentIds.has(enrollmentId);
    }
    if (item.kind === "device") {
      const deviceId = item.id.replace(/^device-/, "");
      return !confirmedRefunds.deviceReservationIds.has(deviceId);
    }
    if (item.kind === "membership" || item.kind === "addon") {
      const subscriptionId =
        item.subscriptionId ?? item.id.replace(/^plan-/, "");
      if (confirmedRefunds.subscriptionIds.has(subscriptionId)) return false;
    }
    // Tennis: direkte Kartenrückerstattung oder bestätigte Rücküberweisung.
    if (item.kind === "court") {
      if (item.cardRefundedAt) return false;
      const courtReservationId = item.id.startsWith("court-")
        ? item.id.slice("court-".length)
        : "";
      if (
        courtReservationId &&
        confirmedRefunds.courtReservationIds.has(courtReservationId)
      ) {
        return false;
      }
    }
    return true;
  });
  // Einnahmen = Kreditkarte + Überweisung (− bestätigte Rückerstattungen via Filter oben).
  const incomingByMethod = summarizeCashReconciliation(cashReconciliationItems);
  const membershipWindows = new Map<
    string,
    { start: Date; end: Date | null }[]
  >();
  for (const membership of clubMemberships) {
    const start = membership.periodStart ?? membership.paidAt;
    if (!start) continue;
    const windows = membershipWindows.get(membership.userId) ?? [];
    windows.push({ start, end: membership.periodEnd });
    membershipWindows.set(membership.userId, windows);
  }
  const withoutMembership = cashReconciliationItems
    .filter((item) => {
      const at = paymentEventDate(item);
      if (at.getTime() < MEMBERSHIP_NOTICES_FROM_MS) return false;
      if (item.kind !== "court" && item.kind !== "course") return false;
      const windows = item.bookerUserId
        ? membershipWindows.get(item.bookerUserId)
        : undefined;
      if (!windows) return true;
      return !windows.some((window) => {
        if (window.start.getTime() > at.getTime()) return false;
        if (window.end && window.end.getTime() < at.getTime()) return false;
        return true;
      });
    })
    .sort(
      (a, b) =>
        paymentEventDate(b).getTime() - paymentEventDate(a).getTime(),
    );
  const withoutMembershipCents = withoutMembership.reduce(
    (sum, item) => sum + paymentExternalCents(item),
    0,
  );
  const paidCents =
    incomingByMethod.stripeCents + incomingByMethod.bankTransferCents;
  const paidCount =
    incomingByMethod.stripeCount + incomingByMethod.bankTransferCount;
  const pendingCents = open.reduce(
    (sum, item) => sum + paymentExternalCents(item),
    0,
  );

  const sectionNameById = new Map(
    access.sections.map((section) => [section.id, section.name]),
  );
  const pendingRefunds: PendingRefundAccountingRow[] = pendingRefundRows.map(
    (row) => ({
      id: row.id,
      kind:
        row.kind === "COURSE"
          ? "course"
          : row.kind === "DEVICE"
            ? "device"
            : row.kind === "COURT"
              ? "court"
              : "subscription",
      title: row.title,
      sectionId: row.sectionId,
      sectionName: row.sectionId
        ? (sectionNameById.get(row.sectionId) ?? "Ohne Sektion")
        : "Ohne Sektion",
      memberName: row.memberName,
      payerName: row.payerName,
      paymentMethod: row.paymentMethod,
      externalCents: row.externalCents,
      stripeFeeCents: row.stripeFeeCents,
      payoutCents: row.payoutCents,
      creditedCents: row.creditedCents,
      createdAt: row.createdAt,
    }),
  );
  const pendingRefundCents = pendingRefunds.reduce(
    (sum, row) => sum + row.payoutCents,
    0,
  );

  const bySection = new Map<string, AccountingBreakdown>();
  const byKind = new Map<string, AccountingBreakdown>();
  const months = monthsForPeriod(periodKey, new Date(), locale);
  const monthIndex = new Map(months.map((month) => [month.key, month]));

  // Dieselbe Basis wie „Einnahmen gesamt“: Karte + Überweisung − bestätigte Rückerstattungen.
  for (const item of cashReconciliationItems) {
    const external = paymentExternalCents(item);
    if (external <= 0) continue;
    const channel = incomingPaymentChannel(item);
    if (channel !== "stripe" && channel !== "bank_transfer") continue;

    addBreakdown(
      bySection,
      item.sectionId ?? "none",
      item.sectionName,
      external,
      true,
    );
    addBreakdown(
      byKind,
      item.kind,
      kindLabel(item.kind, t),
      external,
      true,
    );

    const date = item.paidAt ?? item.createdAt;
    const bucket = monthIndex.get(monthKey(date));
    if (bucket) bucket.paidCents += external;
  }

  for (const item of open) {
    const external = paymentExternalCents(item);
    if (external <= 0) continue;
    addBreakdown(
      bySection,
      item.sectionId ?? "none",
      item.sectionName,
      external,
      false,
    );
    addBreakdown(
      byKind,
      item.kind,
      kindLabel(item.kind, t),
      external,
      false,
    );
  }

  return {
    isGlobalAdmin: access.isGlobalAdmin,
    allowClubWide: access.allowClubWide,
    allowCombined: access.allowCombined,
    sections: access.sections,
    selectedKey: selection.key,
    selectedLabel: selection.label,
    periodKey,
    paidCents,
    pendingCents,
    paidCount,
    pendingCount: open.length,
    incomingByMethod,
    memberCounts,
    bySection: [...bySection.values()].sort((a, b) => b.paidCents - a.paidCents),
    byKind: [...byKind.values()].sort((a, b) => b.paidCents - a.paidCents),
    months,
    incoming,
    open,
    failed,
    bankTransfers,
    pendingRefunds,
    pendingRefundCents,
    pendingRefundCount: pendingRefunds.length,
    withoutMembership,
    withoutMembershipCents,
    withoutMembershipCount: withoutMembership.length,
  };
}

export function paymentStatusLabel(
  status: AccountingPayment["status"],
  t: TFunction,
) {
  if (status === "PAID") return t("accounting.statusPaid");
  if (status === "PENDING") return t("accounting.statusPending");
  if (status === "REFUNDED") return t("accounting.statusRefunded");
  return t("accounting.statusCancelled");
}

export function paymentStatusVariant(
  status: AccountingPayment["status"],
): "default" | "secondary" | "destructive" {
  if (status === "PAID") return "default";
  if (status === "REFUNDED") return "secondary";
  if (status === "PENDING") return "secondary";
  return "destructive";
}

export function paymentKindLabel(kind: AccountingKind, t: TFunction) {
  if (kind === "course") return t("accounting.kindCourse");
  if (kind === "membership") return t("accounting.kindMembership");
  if (kind === "court") return t("accounting.kindCourt");
  if (kind === "device") return t("accounting.kindDevice");
  return t("accounting.kindAddon");
}

export function paymentChannelLabel(item: AccountingPayment, t: TFunction): string {
  const channel = incomingPaymentChannel(item);
  const credit = item.creditAppliedCents;
  const external = paymentExternalCents(item);

  const channelLabel =
    channel === "stripe"
      ? t("accounting.channelCard")
      : channel === "bank_transfer"
        ? t("accounting.channelTransfer")
        : null;

  if (credit > 0 && external > 0) {
    return channelLabel
      ? t("accounting.channelMixed", { channel: channelLabel })
      : t("accounting.channelCredit");
  }
  if (credit > 0) return t("accounting.channelCredit");
  if (channelLabel) return channelLabel;
  if (external <= 0 && credit <= 0) {
    if (
      (item.kind === "membership" || item.kind === "addon") &&
      item.planPricingMode === "FAMILY_BUNDLE"
    ) {
      return t("accounting.channelFamilyBundle");
    }
    return t("accounting.channelFree");
  }
  return "—";
}

/** Nur Einträge mit Status „Erfolgreich“ dürfen aus der Buchhaltung entfernt werden. */
export async function isSuccessfulAccountingPayment(paymentKey: string) {
  if (paymentKey.startsWith("plan-pay-")) {
    const id = paymentKey.slice("plan-pay-".length);
    if (!id) return false;
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id },
      select: {
        id: true,
        subscriptionId: true,
        subscription: { select: { status: true } },
      },
    });
    if (!payment) return false;
    if (payment.subscription.status !== "CANCELLED") return true;
    const latest = await prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: payment.subscriptionId },
      orderBy: { paidAt: "desc" },
      select: { id: true },
    });
    return latest?.id !== payment.id;
  }

  if (paymentKey.startsWith("plan-")) {
    const id = paymentKey.slice("plan-".length);
    if (!id) return false;
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      select: { status: true },
    });
    return subscription?.status === "ACTIVE";
  }

  if (paymentKey.startsWith("course-")) {
    const id = paymentKey.slice("course-".length);
    if (!id) return false;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      select: { status: true },
    });
    return enrollment?.status === "PAID";
  }

  if (paymentKey.startsWith("court-")) {
    const id = paymentKey.slice("court-".length);
    if (!id) return false;
    const reservation = await prisma.courtReservation.findUnique({
      where: { id },
      select: { status: true, priceCents: true },
    });
    return reservation?.status === "CONFIRMED" && reservation.priceCents > 0;
  }

  if (paymentKey.startsWith("device-")) {
    const id = paymentKey.slice("device-".length);
    if (!id) return false;
    const reservation = await prisma.deviceReservation.findUnique({
      where: { id },
      select: { status: true, priceCents: true },
    });
    return reservation?.status === "CONFIRMED" && reservation.priceCents > 0;
  }

  return false;
}

