import { formatDateTime, formatShortDate } from "@/lib/format";
import { isMailConfigured, isSendableEmail, sendMail } from "@/lib/mail";
import { buildMembersExportWorkbook } from "@/lib/members-export";
import { accountingAmountCents } from "@/lib/payment-amounts";
import { prisma } from "@/lib/prisma";
import { isSubscriptionPeriodValid } from "@/lib/subscriptions";
import { buildXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsx-workbook";

export const DEFAULT_REGISTRATION_BACKUP_EMAIL = "info@asclajen.com";
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type PaymentFields = {
  paymentMethod: string | null;
  creditAppliedCents: number;
  paidCents: number | null;
  listPriceCents: number;
  bankTransferApprovedAt: Date | null;
  stripeSessionId: string | null;
  settled: boolean;
};

function parseRecipientList(raw: string | null | undefined) {
  return (raw ?? "")
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function registrationBackupRecipients(override?: string | null) {
  const fromOverride = parseRecipientList(override);
  const fromEnv = parseRecipientList(process.env.REGISTRATION_BACKUP_EMAIL);
  const candidates =
    fromOverride.length > 0
      ? fromOverride
      : fromEnv.length > 0
        ? fromEnv
        : [DEFAULT_REGISTRATION_BACKUP_EMAIL];
  const unique = [...new Set(candidates.map((item) => item.toLowerCase()))];
  const invalid = unique.filter((email) => !isSendableEmail(email));
  const recipients = unique.filter((email) => isSendableEmail(email));
  return { recipients, invalid };
}

function paymentChannelLabel(item: PaymentFields) {
  const credit = Math.max(0, item.creditAppliedCents);
  const booked = item.paidCents ?? (item.settled ? item.listPriceCents : 0);
  const external = Math.max(0, booked - credit);
  let channel: string | null = null;
  if (item.paymentMethod === "BANK_TRANSFER") {
    channel =
      item.settled || item.bankTransferApprovedAt
        ? "Überweisung bestätigt"
        : "Überweisung noch nicht bestätigt";
  } else if (item.paymentMethod === "STRIPE" || item.stripeSessionId) {
    channel = "Kreditkarte";
  }
  if (credit > 0 && (external > 0 || Boolean(channel))) {
    return channel ? `${channel} + Guthaben` : "Guthaben";
  }
  if (credit > 0) return "Guthaben";
  if (channel) return channel;
  if (item.settled && item.listPriceCents === 0) return "Kostenlos";
  return "";
}

function courseStatusLabel(status: string) {
  if (status === "PAID") return "Bezahlt";
  if (status === "CANCELLED") return "Storniert";
  if (status === "WAITLISTED") return "Warteliste";
  return "Offen";
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

function euroAmount(paid: boolean, paidCents: number | null, listPriceCents: number) {
  if (!paid) return null;
  return accountingAmountCents(paidCents, listPriceCents, false) / 100;
}

function compareName(a: string, b: string) {
  return a.localeCompare(b, "de", { sensitivity: "base" });
}

function backupFilename(now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `ASC-Lajen-Abos-Kurse-${day}.xlsx`;
}

export async function buildRegistrationBackupWorkbook(now = new Date()) {
  const [courses, plans] = await Promise.all([
    prisma.course.findMany({
      orderBy: [{ title: "asc" }, { createdAt: "asc" }],
      include: {
        section: { select: { name: true } },
        enrollments: {
          include: {
            user: { select: { name: true, email: true } },
            purchasedBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.subscriptionPlan.findMany({
      orderBy: [{ title: "asc" }, { createdAt: "asc" }],
      include: {
        section: { select: { name: true } },
        subscriptions: {
          include: {
            user: { select: { name: true, email: true } },
            purchasedBy: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const courseSheets: XlsxSheet[] = courses.map((course) => {
    const rows = [...course.enrollments]
      .sort((a, b) => compareName(a.user.name, b.user.name))
      .map((item): XlsxCell[] => {
        const paid = item.status === "PAID";
        return [
          item.user.name,
          item.user.email,
          item.purchasedBy?.name && item.purchasedBy.name !== item.user.name
            ? item.purchasedBy.name
            : "",
          courseStatusLabel(item.status),
          item.paidAt ? formatShortDate(item.paidAt) : "",
          euroAmount(paid, item.paidCents, course.priceCents),
          paymentChannelLabel({
            paymentMethod: item.paymentMethod,
            creditAppliedCents: item.creditAppliedCents,
            paidCents: item.paidCents,
            listPriceCents: course.priceCents,
            bankTransferApprovedAt: item.bankTransferApprovedAt,
            stripeSessionId: item.stripeSessionId,
            settled: paid,
          }),
        ];
      });
    return {
      name: `Kurs ${course.title}`,
      headers: [
        "Mitglied",
        "E-Mail",
        "Gebucht von",
        "Status",
        "Bezahlt am",
        "Betrag",
        "Zahlungsart",
      ],
      rows,
      numberColumns: [5],
    };
  });

  const planSheets: XlsxSheet[] = plans.map((plan) => {
    const rows = [...plan.subscriptions]
      .sort((a, b) => compareName(a.user.name, b.user.name))
      .map((item): XlsxCell[] => {
        return [
          item.user.name,
          item.user.email,
          item.purchasedBy?.name && item.purchasedBy.name !== item.user.name
            ? item.purchasedBy.name
            : "",
          subscriptionStatusLabel(item.status, item.periodEnd, now),
          item.paidAt ? formatShortDate(item.paidAt) : "",
          euroAmount(
            Boolean(item.paidAt) ||
              item.status === "ACTIVE" ||
              item.status === "SCHEDULED",
            item.paidCents,
            plan.priceCents,
          ),
          item.periodStart ? formatShortDate(item.periodStart) : "",
          item.periodEnd ? formatShortDate(item.periodEnd) : "",
          paymentChannelLabel({
            paymentMethod: item.paymentMethod,
            creditAppliedCents: item.creditAppliedCents,
            paidCents: item.paidCents,
            listPriceCents: plan.priceCents,
            bankTransferApprovedAt: item.bankTransferApprovedAt,
            stripeSessionId: item.stripeSessionId,
            settled: item.status === "ACTIVE" || item.status === "SCHEDULED",
          }),
        ];
      });
    return {
      name: `Abo ${plan.title}`,
      headers: [
        "Mitglied",
        "E-Mail",
        "Gebucht von",
        "Status",
        "Bezahlt am",
        "Betrag",
        "Gültig von",
        "Gültig bis",
        "Zahlungsart",
      ],
      rows,
      numberColumns: [5],
    };
  });

  const enrollmentCount = courses.reduce(
    (sum, course) => sum + course.enrollments.length,
    0,
  );
  const subscriptionCount = plans.reduce(
    (sum, plan) => sum + plan.subscriptions.length,
    0,
  );

  const overview: XlsxSheet = {
    name: "Übersicht",
    headers: ["Feld", "Wert"],
    rows: [
      ["Erstellt am", formatDateTime(now)],
      ["Kurse", courses.length],
      ["Kurs-Anmeldungen", enrollmentCount],
      ["Abos", plans.length],
      ["Abo-Anmeldungen", subscriptionCount],
      ...courses.map((course) => [
        `Kurs · ${course.title}`,
        `${course.enrollments.length} Anmeldung(en)${
          course.section?.name ? ` · ${course.section.name}` : ""
        }`,
      ]),
      ...plans.map((plan) => [
        `Abo · ${plan.title}`,
        `${plan.subscriptions.length} Anmeldung(en)${
          plan.section?.name ? ` · ${plan.section.name}` : ""
        }`,
      ]),
    ],
  };

  const buffer = buildXlsx([overview, ...courseSheets, ...planSheets]);
  return {
    buffer,
    filename: backupFilename(now),
    courseCount: courses.length,
    enrollmentCount,
    planCount: plans.length,
    subscriptionCount,
  };
}

function backupEmailCopy(input: {
  registrationsFilename: string;
  membersFilename: string;
  createdAt: Date;
  courseCount: number;
  enrollmentCount: number;
  planCount: number;
  subscriptionCount: number;
  memberCount: number;
}) {
  const when = formatDateTime(input.createdAt);
  const subject = `Backup Abos, Kurse und Mitglieder – ${formatShortDate(input.createdAt)}`;
  const text =
    `Guten Tag,\n\n` +
    `im Anhang finden Sie das Backup der Anmeldungen und der Mitgliederverwaltung.\n\n` +
    `Stand: ${when}\n` +
    `Kurse: ${input.courseCount} (${input.enrollmentCount} Anmeldungen)\n` +
    `Abos: ${input.planCount} (${input.subscriptionCount} Anmeldungen)\n` +
    `Mitglieder: ${input.memberCount}\n\n` +
    `Dateien:\n` +
    `– ${input.registrationsFilename} (jedes Blatt = Kurs oder Abo)\n` +
    `– ${input.membersFilename} (Mitglieder + Mitgliedschaften)\n\n` +
    `ASC Lajen Raiffeisen`;
  const html =
    `<p>Guten Tag,</p>` +
    `<p>im Anhang finden Sie das Backup der Anmeldungen und der Mitgliederverwaltung.</p>` +
    `<p>Stand: ${when}<br/>` +
    `Kurse: ${input.courseCount} (${input.enrollmentCount} Anmeldungen)<br/>` +
    `Abos: ${input.planCount} (${input.subscriptionCount} Anmeldungen)<br/>` +
    `Mitglieder: ${input.memberCount}</p>` +
    `<ul>` +
    `<li><strong>${input.registrationsFilename}</strong> – jedes Blatt ist ein Kurs oder ein Abo</li>` +
    `<li><strong>${input.membersFilename}</strong> – Mitglieder und Mitgliedschaften</li>` +
    `</ul>` +
    `<p>ASC Lajen Raiffeisen</p>`;
  return { subject, text, html };
}

export async function sendRegistrationBackupEmail(options?: { to?: string | null }) {
  const { recipients, invalid } = registrationBackupRecipients(options?.to);
  if (recipients.length === 0) {
    return {
      ok: false as const,
      message:
        invalid.length > 0
          ? `Ungültige Empfängeradresse: ${invalid.join(", ")}.`
          : "Keine gültige Empfängeradresse für das Backup.",
    };
  }
  if (!isMailConfigured()) {
    return {
      ok: false as const,
      message: "E-Mail-Versand ist nicht konfiguriert.",
    };
  }

  const createdAt = new Date();
  const [workbook, members] = await Promise.all([
    buildRegistrationBackupWorkbook(createdAt),
    buildMembersExportWorkbook(createdAt),
  ]);
  const copy = backupEmailCopy({
    registrationsFilename: workbook.filename,
    membersFilename: members.filename,
    createdAt,
    courseCount: workbook.courseCount,
    enrollmentCount: workbook.enrollmentCount,
    planCount: workbook.planCount,
    subscriptionCount: workbook.subscriptionCount,
    memberCount: members.memberCount,
  });
  const attachments = [
    {
      filename: workbook.filename,
      content: workbook.buffer,
      contentType: XLSX_CONTENT_TYPE,
    },
    {
      filename: members.filename,
      content: members.buffer,
      contentType: XLSX_CONTENT_TYPE,
    },
  ];

  const delivered: string[] = [];
  const failures: string[] = [];
  for (const to of recipients) {
    const result = await sendMail({
      to,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      attachments,
    });
    if (result.sent) delivered.push(to);
    else failures.push(`${to}: ${result.message}`);
  }

  const summary = {
    filename: workbook.filename,
    membersFilename: members.filename,
    courseCount: workbook.courseCount,
    enrollmentCount: workbook.enrollmentCount,
    planCount: workbook.planCount,
    subscriptionCount: workbook.subscriptionCount,
    memberCount: members.memberCount,
  };

  if (delivered.length === 0) {
    return {
      ok: false as const,
      message: failures.join(" ") || "E-Mail-Versand fehlgeschlagen.",
      ...summary,
    };
  }

  return {
    ok: true as const,
    to: delivered,
    failed: failures,
    ...summary,
  };
}
