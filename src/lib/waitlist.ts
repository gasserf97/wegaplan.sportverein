import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isSendableEmail, sendMail } from "@/lib/mail";
import { formatDateTime } from "@/lib/format";
import { getPublicAppUrl } from "@/lib/stripe";
import {
  countActiveCourseEnrollments,
  isRegistrationOpen,
  remainingCourseSlots,
} from "@/lib/courses";
import { prisma } from "@/lib/prisma";

export const WAITLIST_MAX_SIZE = 5;
export const WAITLIST_OFFER_HOURS = 48;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createWaitlistOfferToken() {
  return randomBytes(24).toString("hex");
}

export function waitlistOfferUrl(
  courseId: string,
  enrollmentId: string,
  token: string,
) {
  const appUrl = getPublicAppUrl();
  const params = new URLSearchParams({ enrollment: enrollmentId, token });
  return `${appUrl}/kurse/${courseId}/platz-sichern?${params.toString()}`;
}

export async function countWaitlistEntries(courseId: string) {
  return prisma.enrollment.count({
    where: { courseId, status: "WAITLISTED" },
  });
}

export async function waitlistPosition(
  courseId: string,
  enrollmentId: string,
): Promise<number | null> {
  const rows = await prisma.enrollment.findMany({
    where: { courseId, status: "WAITLISTED" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const index = rows.findIndex((row) => row.id === enrollmentId);
  return index === -1 ? null : index + 1;
}

export function waitlistOfferDeadline(from = new Date()) {
  return new Date(from.getTime() + WAITLIST_OFFER_HOURS * 60 * 60 * 1000);
}

export function isWaitlistOfferActive(enrollment: {
  offerExpiresAt: Date | null;
  waitlistOfferToken: string | null;
}) {
  return Boolean(
    enrollment.waitlistOfferToken &&
      enrollment.offerExpiresAt &&
      enrollment.offerExpiresAt > new Date(),
  );
}

export function clearWaitlistOfferData() {
  return {
    offerExpiresAt: null,
    waitlistOfferToken: null,
    promotedAt: null,
  };
}

export async function sendWaitlistPromotionEmail(input: {
  to: string;
  memberName: string;
  courseTitle: string;
  priceCents: number;
  offerUrl: string;
  expiresAt: Date;
}) {
  if (!isSendableEmail(input.to)) {
    console.error("Wartelisten-Mail: ungültige Adresse", input.to);
    return { sent: false as const };
  }

  const priceLabel = `${(input.priceCents / 100).toFixed(2).replace(".", ",")} €`;
  const expiresLabel = formatDateTime(input.expiresAt);
  const subject = `Platz frei: ${input.courseTitle} – ASC Lajen`;
  const text = [
    `Guten Tag${input.memberName ? ` ${input.memberName}` : ""},`,
    "",
    `für den Kurs „${input.courseTitle}“ ist ein Platz frei geworden.`,
    `Sie können ihn bis ${expiresLabel} für ${priceLabel} sichern:`,
    input.offerUrl,
    "",
    "Wenn Sie nicht rechtzeitig zahlen, wird der Platz an die nächste Person auf der Warteliste vergeben.",
    "",
    "ASC Lajen Raiffeisen",
  ].join("\n");
  const href = escapeHtml(input.offerUrl);
  const greetName = input.memberName ? ` ${escapeHtml(input.memberName)}` : "";
  const html = [
    `<p>Guten Tag${greetName},</p>`,
    `<p>für den Kurs <strong>${escapeHtml(input.courseTitle)}</strong> ist ein Platz frei geworden.</p>`,
    `<p>Bitte sichern Sie ihn bis <strong>${escapeHtml(expiresLabel)}</strong> für <strong>${escapeHtml(priceLabel)}</strong>:</p>`,
    `<p><a href="${href}">Platz jetzt sichern</a></p>`,
    `<p>Wenn Sie nicht rechtzeitig zahlen, wird der Platz an die nächste Person auf der Warteliste vergeben.</p>`,
    `<p>ASC Lajen Raiffeisen</p>`,
  ].join("");

  const result = await sendMail({ to: input.to, subject, text, html });
  if (!result.sent) {
    console.error("Wartelisten-Mail", "message" in result ? result.message : "");
  }
  return result;
}

export async function promoteNextFromWaitlist(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course?.maxParticipants) return { promoted: false as const };

  const activeCount = await countActiveCourseEnrollments(courseId);
  const spotsLeft = remainingCourseSlots(course.maxParticipants, activeCount);
  if (spotsLeft == null || spotsLeft <= 0) {
    return { promoted: false as const };
  }

  const next = await prisma.enrollment.findFirst({
    where: { courseId, status: "WAITLISTED" },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          managedBy: { select: { email: true } },
        },
      },
      purchasedBy: { select: { name: true, email: true } },
      course: { select: { title: true, priceCents: true } },
    },
  });
  if (!next) return { promoted: false as const };

  const token = createWaitlistOfferToken();
  const expiresAt = waitlistOfferDeadline();
  const lockedPriceCents = next.paidCents ?? next.course.priceCents;

  await prisma.enrollment.update({
    where: { id: next.id },
    data: {
      status: "PENDING",
      promotedAt: new Date(),
      offerExpiresAt: expiresAt,
      waitlistOfferToken: token,
      paidCents: lockedPriceCents,
    },
  });

  const { resolveNotificationEmail } = await import("@/lib/notification-email");
  const notifyEmail = resolveNotificationEmail(
    next.user.email,
    next.purchasedBy?.email,
    next.user.managedBy?.email,
  );
  const notifyName = next.purchasedBy?.name ?? next.user.name;

  if (notifyEmail) {
    await sendWaitlistPromotionEmail({
      to: notifyEmail,
      memberName: notifyName,
      courseTitle: next.course.title,
      priceCents: lockedPriceCents,
      offerUrl: waitlistOfferUrl(courseId, next.id, token),
      expiresAt,
    });
  } else {
    console.error(
      "Warteliste-Benachrichtigung ohne Empfänger-E-Mail",
      next.id,
    );
  }

  revalidatePath(`/kurse/${courseId}`);
  revalidatePath("/konto");

  return { promoted: true as const, enrollmentId: next.id };
}

export async function processExpiredWaitlistOffers(now = new Date()) {
  const expired = await prisma.enrollment.findMany({
    where: {
      status: "PENDING",
      waitlistOfferToken: { not: null },
      offerExpiresAt: { lt: now },
    },
    select: { id: true, courseId: true },
  });

  let expiredCount = 0;
  let promotedCount = 0;

  for (const row of expired) {
    await prisma.enrollment.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        ...clearWaitlistOfferData(),
        paymentMethod: null,
        paymentReference: null,
        bankTransferGroupId: null,
        stripeSessionId: null,
        creditAppliedCents: 0,
      },
    });
    expiredCount += 1;
    const result = await promoteNextFromWaitlist(row.courseId);
    if (result.promoted) promotedCount += 1;
    revalidatePath(`/kurse/${row.courseId}`);
  }

  if (expiredCount > 0) {
    revalidatePath("/konto");
    revalidatePath("/admin");
  }

  return { expiredCount, promotedCount };
}

export async function tryPromoteWaitlistAfterCancellation(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { registrationDeadline: true, maxParticipants: true },
  });
  if (!course?.maxParticipants) return;
  if (!isRegistrationOpen(course.registrationDeadline)) return;

  await promoteNextFromWaitlist(courseId);
}
