import {
  resolveConfirmationTitle,
  yearFromDate,
} from "@/lib/confirmation-title";
import {
  isMailConfigured,
  mailConfigIssue,
  sendMail,
  type MailAttachment,
} from "@/lib/mail";
import { resolveConfirmationDelivery } from "@/lib/notification-email";
import {
  buildCourseConfirmationMailCopy,
  buildCoursePaymentConfirmationPdf,
  confirmationPdfFilename,
  courseConfirmationSubject,
} from "@/lib/payment-confirmation-pdf";
import { prisma } from "@/lib/prisma";
import { displayUserTaxId } from "@/lib/profile";

export type ConfirmationSendResult =
  | {
      sent: true;
      alreadySent?: boolean;
      skipped?: boolean;
      recipients?: string[];
      provider?: string;
      messageIds?: string[];
    }
  | { sent: false; message: string };

const enrollmentInclude = {
  course: {
    select: {
      title: true,
      confirmationTitle: true,
      startsAt: true,
      endsAt: true,
      priceCents: true,
    },
  },
  user: {
    select: {
      name: true,
      email: true,
      taxId: true,
      street: true,
      postalCode: true,
      city: true,
      managedBy: { select: { name: true, email: true } },
    },
  },
  purchasedBy: { select: { name: true, email: true } },
} as const;

type EnrollmentForConfirmation = Awaited<
  ReturnType<
    typeof prisma.enrollment.findUnique<{
      where: { id: string };
      include: typeof enrollmentInclude;
    }>
  >
>;

async function deliverConfirmationMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
  logLabel: string;
  entityId: string;
}): Promise<ConfirmationSendResult> {
  if (!isMailConfigured()) {
    const message =
      mailConfigIssue() ?? "E-Mail-Versand ist nicht konfiguriert.";
    console.error(input.logLabel, input.entityId, message);
    return { sent: false, message };
  }

  try {
    const result = await sendMail({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });
    if (result.sent) {
      console.info(input.logLabel, "an", input.to, result.messageId ?? "ok");
      return {
        sent: true,
        recipients: [input.to],
        provider: result.provider,
        messageIds: result.messageId ? [result.messageId] : undefined,
      };
    }
    console.error(input.logLabel, "an", input.to, result.message);
    return { sent: false, message: result.message };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Versandfehler.";
    console.error(input.logLabel, "an", input.to, error);
    return { sent: false, message };
  }
}

function enrollmentDelivery(enrollment: NonNullable<EnrollmentForConfirmation>) {
  return resolveConfirmationDelivery({
    memberEmail: enrollment.user.email,
    memberName: enrollment.user.name,
    purchaserEmail: enrollment.purchasedBy?.email,
    purchaserName: enrollment.purchasedBy?.name,
    managerEmail: enrollment.user.managedBy?.email,
    managerName: enrollment.user.managedBy?.name,
  });
}

function courseTitleFor(enrollment: NonNullable<EnrollmentForConfirmation>) {
  return resolveConfirmationTitle(
    enrollment.course.confirmationTitle,
    enrollment.course.title,
    yearFromDate(enrollment.course.startsAt) ??
      yearFromDate(enrollment.course.endsAt),
  );
}

async function buildEnrollmentPdfAttachment(
  enrollment: NonNullable<EnrollmentForConfirmation>,
): Promise<{ item: { memberName: string; courseTitle: string }; attachment: MailAttachment }> {
  const memberName = enrollment.user.name;
  const courseTitle = courseTitleFor(enrollment);
  const amountCents = enrollment.paidCents ?? enrollment.course.priceCents;
  const paidAt = enrollment.paidAt ?? new Date();
  const pdf = await buildCoursePaymentConfirmationPdf({
    memberName,
    memberTaxId: displayUserTaxId(enrollment.user.taxId),
    street: enrollment.user.street,
    postalCode: enrollment.user.postalCode,
    city: enrollment.user.city,
    courseTitle,
    amountCents,
    paidAt,
  });
  return {
    item: { memberName, courseTitle },
    attachment: {
      filename: confirmationPdfFilename(courseTitle, memberName),
      content: pdf,
      contentType: "application/pdf",
    },
  };
}

export async function buildEnrollmentConfirmationPdf(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: enrollmentInclude,
  });
  if (!enrollment || enrollment.status !== "PAID") return null;
  const { attachment } = await buildEnrollmentPdfAttachment(enrollment);
  return attachment;
}

async function sendCourseConfirmationGroup(
  enrollments: NonNullable<EnrollmentForConfirmation>[],
  options?: { force?: boolean },
): Promise<ConfirmationSendResult> {
  if (enrollments.length === 0) {
    return { sent: false, message: "Keine bezahlte Kursbuchung gefunden." };
  }

  const deliveries = enrollments.map((enrollment) => ({
    enrollment,
    delivery: enrollmentDelivery(enrollment),
  }));
  const primary =
    deliveries.find((row) => row.delivery?.isOwnMailbox)?.delivery ??
    deliveries[0]?.delivery;
  if (!primary) {
    const message =
      "Keine gültige Empfänger-E-Mail (ungültig oder Demo-Adresse).";
    console.error("Kurs-Bestätigungsmail", enrollments[0].id, message);
    return { sent: false, message };
  }

  const prepared = await Promise.all(
    enrollments.map((enrollment) => buildEnrollmentPdfAttachment(enrollment)),
  );
  const items = prepared.map((row) => row.item);
  const attachments = prepared.map((row) => row.attachment);
  const copy = buildCourseConfirmationMailCopy({
    recipientName: primary.greetingName,
    items,
  });

  const result = await deliverConfirmationMail({
    to: primary.email,
    subject: courseConfirmationSubject(items),
    html: copy.html,
    text: copy.text,
    attachments,
    logLabel: "Kurs-Bestätigungsmail",
    entityId: enrollments.map((item) => item.id).join(","),
  });

  if (result.sent) {
    const sentAt = new Date();
    await prisma.enrollment.updateMany({
      where: { id: { in: enrollments.map((item) => item.id) } },
      data: { confirmationEmailSentAt: sentAt },
    });
  }
  void options;
  return result;
}

export async function sendCourseEnrollmentConfirmation(
  enrollmentId: string,
  options?: { force?: boolean },
): Promise<ConfirmationSendResult> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: enrollmentInclude,
  });

  if (!enrollment || enrollment.status !== "PAID") {
    return { sent: false, message: "Keine bezahlte Kursbuchung gefunden." };
  }
  if (enrollment.confirmationEmailSentAt && !options?.force) {
    return { sent: true, alreadySent: true };
  }

  return sendCourseConfirmationGroup([enrollment], options);
}

/**
 * Bestätigungen pro Empfänger-Postfach bündeln:
 * – eigenes Konto/E-Mail → eigene Mail
 * – Kind ohne E-Mail → mit Mutter/Käufer in einer Mail (mehrere PDFs)
 */
export async function sendCourseEnrollmentConfirmations(
  enrollmentIds: string[],
) {
  const unique = [...new Set(enrollmentIds.filter(Boolean))];
  if (unique.length === 0) return;

  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: unique }, status: "PAID" },
    include: enrollmentInclude,
  });

  const groups = new Map<string, NonNullable<EnrollmentForConfirmation>[]>();

  for (const enrollment of enrollments) {
    if (enrollment.confirmationEmailSentAt) {
      console.info("Kurs-Bestätigungsmail bereits gesendet", enrollment.id);
      continue;
    }
    const delivery = enrollmentDelivery(enrollment);
    if (!delivery) {
      console.error(
        "Kurs-Bestätigungsmail",
        enrollment.id,
        "Keine gültige Empfänger-E-Mail (ungültig oder Demo-Adresse).",
      );
      continue;
    }
    const list = groups.get(delivery.email) ?? [];
    list.push(enrollment);
    groups.set(delivery.email, list);
  }

  for (const [, group] of groups) {
    try {
      const result = await sendCourseConfirmationGroup(group);
      if (!result.sent) {
        console.error(
          "Kurs-Bestätigungsmail",
          group.map((item) => item.id).join(","),
          result.message,
        );
      }
    } catch (error) {
      console.error(
        "Kurs-Bestätigungsmail",
        group.map((item) => item.id).join(","),
        error,
      );
    }
  }
}

export async function sendSubscriptionConfirmation(
  subscriptionId: string,
  options?: { force?: boolean },
): Promise<ConfirmationSendResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: {
        select: {
          title: true,
          confirmationTitle: true,
          priceCents: true,
          kind: true,
        },
      },
      user: {
        select: {
          name: true,
          email: true,
          taxId: true,
          street: true,
          postalCode: true,
          city: true,
          managedBy: { select: { name: true, email: true } },
        },
      },
      purchasedBy: { select: { name: true, email: true } },
    },
  });

  if (
    !subscription ||
    (subscription.status !== "ACTIVE" && subscription.status !== "SCHEDULED")
  ) {
    return { sent: false, message: "Keine bestätigte Buchung gefunden." };
  }
  // Die Mitgliedskarte ist die einzige E-Mail für Vereinsmitgliedschaften.
  if (subscription.plan.kind === "MEMBERSHIP") {
    return { sent: true, skipped: true };
  }
  if (subscription.confirmationEmailSentAt && !options?.force) {
    return { sent: true, alreadySent: true };
  }

  const delivery = resolveConfirmationDelivery({
    memberEmail: subscription.user.email,
    memberName: subscription.user.name,
    purchaserEmail: subscription.purchasedBy?.email,
    purchaserName: subscription.purchasedBy?.name,
    managerEmail: subscription.user.managedBy?.email,
    managerName: subscription.user.managedBy?.name,
  });
  if (!delivery) {
    return {
      sent: false,
      message: "Keine gültige Empfänger-E-Mail (ungültig oder Demo-Adresse).",
    };
  }

  const memberName = subscription.user.name;
  const planTitle = resolveConfirmationTitle(
    subscription.plan.confirmationTitle,
    subscription.plan.title,
    yearFromDate(subscription.periodEnd) ??
      yearFromDate(subscription.periodStart),
  );
  const amountCents = subscription.paidCents ?? subscription.plan.priceCents;
  const paidAt = subscription.paidAt ?? new Date();
  const pdf = await buildCoursePaymentConfirmationPdf({
    memberName,
    memberTaxId: displayUserTaxId(subscription.user.taxId),
    street: subscription.user.street,
    postalCode: subscription.user.postalCode,
    city: subscription.user.city,
    courseTitle: planTitle,
    amountCents,
    paidAt,
  });
  const items = [{ memberName, courseTitle: planTitle }];
  const copy = buildCourseConfirmationMailCopy({
    recipientName: delivery.greetingName,
    items,
    context: "subscription",
  });

  const result = await deliverConfirmationMail({
    to: delivery.email,
    subject: courseConfirmationSubject(items),
    html: copy.html,
    text: copy.text,
    attachments: [
      {
        filename: confirmationPdfFilename(planTitle, memberName),
        content: pdf,
        contentType: "application/pdf",
      },
    ],
    logLabel: "Abo-Einzahlungsbestätigung",
    entityId: subscriptionId,
  });

  if (result.sent) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { confirmationEmailSentAt: new Date() },
    });
  }
  return result;
}
