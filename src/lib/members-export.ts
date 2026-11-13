import { formatBirthDate, formatShortDate } from "@/lib/format";
import {
  displayUserEmail,
  displayUserName,
  displayUserTaxId,
} from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { isSubscriptionPeriodValid } from "@/lib/subscriptions";
import { buildXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsx-workbook";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function yesNo(value: boolean) {
  return value ? "Ja" : "Nein";
}

function subscriptionStatusLabel(
  status: string,
  periodEnd: Date | null,
  now: Date,
) {
  if (status === "SCHEDULED") return "Vorgemerkt";
  if (status === "PENDING") return "Offen";
  if (status === "CANCELLED") return "Storniert";
  if (status === "ACTIVE") {
    return isSubscriptionPeriodValid(periodEnd, now) ? "Aktiv" : "Abgelaufen";
  }
  return status;
}

function planKindLabel(kind: string) {
  return kind === "MEMBERSHIP" ? "Mitgliedschaft" : "Zusatzmitgliedschaft";
}

function paymentMethodLabel(
  method: string | null,
  stripeSessionId: string | null,
) {
  if (method === "BANK_TRANSFER") return "Überweisung";
  if (method === "STRIPE" || stripeSessionId) return "Kreditkarte";
  return "";
}

function compareName(a: string, b: string) {
  return a.localeCompare(b, "de", { sensitivity: "base" });
}

function exportFilename(now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `ASC-Lajen-Mitglieder-${day}.xlsx`;
}

export async function buildMembersExportWorkbook(now = new Date()) {
  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { username: "asc" }],
    include: {
      managedBy: { select: { name: true, email: true, username: true } },
      dependents: { select: { name: true }, orderBy: { name: "asc" } },
      sections: {
        include: { section: { select: { name: true } } },
      },
      sectionAdminOf: {
        include: { section: { select: { name: true } } },
      },
      subscriptions: {
        include: {
          plan: {
            select: {
              title: true,
              kind: true,
              priceCents: true,
              section: { select: { name: true } },
            },
          },
        },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  const memberHeaders = [
    "Benutzername",
    "Name",
    "E-Mail",
    "Telefon",
    "Steuernummer",
    "Straße",
    "PLZ",
    "Ort",
    "Geburtsdatum",
    "Rolle",
    "Login möglich",
    "E-Mail bestätigt",
    "Registriert am",
    "Letzte Aktivität",
    "Guthaben (€)",
    "Familienkonto von",
    "Angehörige",
    "Sektionen",
    "Sektionsadmin",
    "Sportverein-Mitgliedschaft",
    "Tennis-Mitgliedschaft",
    "Fuhrpark-Recht",
    "Aktive Mitgliedschaften",
  ];

  const memberRows: XlsxCell[][] = users.map((user) => {
    const activeSubs = user.subscriptions.filter(
      (item) =>
        item.status === "ACTIVE" &&
        isSubscriptionPeriodValid(item.periodEnd, now),
    );
    const scheduledSubs = user.subscriptions.filter(
      (item) => item.status === "SCHEDULED",
    );
    const currentSubs = [...activeSubs, ...scheduledSubs];
    const hasClub = currentSubs.some((item) => item.plan.kind === "MEMBERSHIP");
    const hasTennis = currentSubs.some(
      (item) =>
        item.plan.kind === "ADDON" && item.plan.section?.name === "Tennis",
    );
    const membershipsText = currentSubs
      .map((item) => {
        const until = item.periodEnd
          ? ` bis ${formatShortDate(item.periodEnd)}`
          : "";
        const status =
          item.status === "SCHEDULED" ? " (vorgemerkt)" : "";
        return `${item.plan.title}${until}${status}`;
      })
      .join("; ");
    const sections = user.sections
      .map((item) => item.section.name)
      .sort(compareName)
      .join("; ");
    const sectionAdmins = user.sectionAdminOf
      .map((item) => item.section.name)
      .sort(compareName)
      .join("; ");
    const familyOf = user.managedBy
      ? displayUserName(user.managedBy.name) ||
        displayUserEmail(user.managedBy.email) ||
        user.managedBy.username
      : "";
    const dependents = user.dependents
      .map((item) => displayUserName(item.name) || "—")
      .join("; ");

    return [
      user.username,
      displayUserName(user.name),
      displayUserEmail(user.email),
      user.phone,
      displayUserTaxId(user.taxId),
      user.street,
      user.postalCode,
      user.city,
      formatBirthDate(user.birthDate),
      user.role === "ADMIN" ? "Haupt-Admin" : "Mitglied",
      yesNo(user.canLogin),
      yesNo(Boolean(user.emailVerifiedAt)),
      formatShortDate(user.createdAt),
      user.lastLoginAt ? formatShortDate(user.lastLoginAt) : "",
      user.creditBalanceCents / 100,
      familyOf,
      dependents,
      sections,
      sectionAdmins,
      yesNo(hasClub),
      yesNo(hasTennis),
      yesNo(user.role === "ADMIN" || user.canBookDevices),
      membershipsText,
    ];
  });

  const membersSheet: XlsxSheet = {
    name: "Mitglieder",
    headers: memberHeaders,
    rows: memberRows,
    numberColumns: [14],
  };

  const subHeaders = [
    "Mitglied",
    "E-Mail",
    "Benutzername",
    "Abo / Plan",
    "Art",
    "Sektion",
    "Status",
    "Gültig von",
    "Gültig bis",
    "Bezahlt am",
    "Betrag (€)",
    "Zahlungsart",
    "Auto-Verlängerung",
  ];

  const subRows: XlsxCell[][] = [];
  for (const user of users) {
    const name = displayUserName(user.name) || user.username;
    const email = displayUserEmail(user.email);
    for (const item of user.subscriptions) {
      if (item.status === "CANCELLED" && !item.paidAt) continue;
      subRows.push([
        name,
        email,
        user.username,
        item.plan.title,
        planKindLabel(item.plan.kind),
        item.plan.section?.name ?? "",
        subscriptionStatusLabel(item.status, item.periodEnd, now),
        item.periodStart ? formatShortDate(item.periodStart) : "",
        item.periodEnd ? formatShortDate(item.periodEnd) : "",
        item.paidAt ? formatShortDate(item.paidAt) : "",
        item.paidCents != null
          ? item.paidCents / 100
          : item.status === "ACTIVE" || item.status === "SCHEDULED"
            ? item.plan.priceCents / 100
            : null,
        paymentMethodLabel(item.paymentMethod, item.stripeSessionId),
        yesNo(item.autoRenew),
      ]);
    }
  }

  const subscriptionsSheet: XlsxSheet = {
    name: "Mitgliedschaften",
    headers: subHeaders,
    rows: subRows,
    numberColumns: [10],
  };

  const buffer = buildXlsx([membersSheet, subscriptionsSheet]);
  return {
    buffer,
    filename: exportFilename(now),
    memberCount: users.length,
    subscriptionCount: subRows.length,
  };
}
