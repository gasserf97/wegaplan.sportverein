"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateCourseEnrollment,
  resolveMemberIds,
  validateWaitlistJoinSelection,
} from "@/lib/course-enrollment";
import { prisma } from "@/lib/prisma";
import { resolveCoursePrice } from "@/lib/pricing";
import {
  isWaitlistOfferActive,
  processExpiredWaitlistOffers,
} from "@/lib/waitlist";

export type WaitlistActionState = { error: string } | { ok: true; message: string } | null;

export async function prepareWaitlistEnrollmentsAction(
  courseId: string,
  memberIds?: string[],
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Bitte melden Sie sich an." };

  const members = await resolveMemberIds(user.id, memberIds);
  if ("error" in members) return { error: members.error };

  const validation = await validateWaitlistJoinSelection(
    user.id,
    courseId,
    members.ids,
    user.role === "ADMIN",
  );
  if ("error" in validation) return { error: validation.error };

  const enrollments = [];
  for (const memberId of members.ids) {
    const result = await getOrCreateCourseEnrollment(memberId, courseId);
    if (!result.ok) {
      const person = validation.personById.get(memberId);
      return { error: `${person?.name ?? "Person"}: ${result.error}` };
    }
    await prisma.enrollment.update({
      where: { id: result.enrollment.id },
      data: { purchasedById: user.id },
    });
    const person = validation.personById.get(memberId);
    enrollments.push({
      enrollmentId: result.enrollment.id,
      userId: memberId,
      userName: person?.name ?? "Mitglied",
      hasAttest: Boolean(result.enrollment.medicalCertificate),
      fileName: result.enrollment.medicalCertificate?.originalName,
    });
  }

  if (enrollments.length === 0) {
    return { error: "Niemand in der Auswahl kann auf die Warteliste." };
  }

  return { enrollments };
}

export async function joinWaitlistAction(
  courseId: string,
  memberIds?: string[],
): Promise<WaitlistActionState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/anmelden?next=/kurse/${courseId}`);

  const members = await resolveMemberIds(user.id, memberIds);
  if ("error" in members) return { error: members.error };

  const validation = await validateWaitlistJoinSelection(
    user.id,
    courseId,
    members.ids,
    user.role === "ADMIN",
  );
  if ("error" in validation) return { error: validation.error };
  const { course } = validation;

  const enrollments = [];
  for (const memberId of members.ids) {
    const result = await getOrCreateCourseEnrollment(memberId, courseId);
    if (!result.ok) {
      const person = validation.personById.get(memberId);
      return { error: `${person?.name ?? "Person"}: ${result.error}` };
    }
    enrollments.push(result.enrollment);
  }

  await prisma.$transaction(
    enrollments.map((enrollment) => {
      const person = validation.personById.get(enrollment.userId);
      const price = resolveCoursePrice(course, person?.birthDate ?? null);
      return prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: "WAITLISTED",
          purchasedById: user.id,
          paidCents: price.cents,
          paymentMethod: null,
          paymentReference: null,
          bankTransferGroupId: null,
          stripeSessionId: null,
          creditAppliedCents: 0,
        },
      });
    }),
  );

  revalidatePath(`/kurse/${courseId}`);
  revalidatePath("/konto");
  revalidatePath("/admin");

  const count = enrollments.length;
  return {
    ok: true,
    message:
      count === 1
        ? "Sie stehen auf der Warteliste. Wir benachrichtigen Sie per E-Mail, sobald ein Platz frei wird."
        : `${count} Personen stehen auf der Warteliste. Wir benachrichtigen Sie per E-Mail, sobald Plätze frei werden.`,
  };
}

export async function validateWaitlistOfferAccess(
  courseId: string,
  enrollmentId: string,
  token: string,
) {
  await processExpiredWaitlistOffers();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { name: true } },
      course: { select: { id: true, title: true, priceCents: true } },
    },
  });

  if (
    !enrollment ||
    enrollment.courseId !== courseId ||
    enrollment.waitlistOfferToken !== token ||
    enrollment.status !== "PENDING"
  ) {
    return { error: "Dieses Platz-Angebot ist ungültig oder abgelaufen." as const };
  }

  if (!isWaitlistOfferActive(enrollment)) {
    return { error: "Die Frist zum Sichern des Platzes ist abgelaufen." as const };
  }

  return { enrollment };
}
