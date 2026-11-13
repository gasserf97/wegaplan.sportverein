"use server";

import { revalidatePath } from "next/cache";
import { activateSubscription } from "@/lib/activate-subscription";
import { sendCourseEnrollmentConfirmations } from "@/lib/booking-confirmation";
import { finalizeCourseEnrollmentPayments } from "@/lib/credit";
import { clearWaitlistOfferData } from "@/lib/waitlist";
import { requireCourseManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCourse, canManagePlan } from "@/lib/permissions";
import { revalidateEnrollmentViews } from "@/lib/revalidate-enrollments";
import { revalidateSubscriptionViews } from "@/lib/revalidate-subscriptions";

export type ApproveBankTransferState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

async function canApproveEnrollment(userId: string, enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: true },
  });
  if (!enrollment?.course) return false;
  return canManageCourse(userId, enrollment.course);
}

async function canApproveSubscription(userId: string, subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!subscription?.plan) return false;
  return canManagePlan(userId, subscription.plan);
}

export async function approveBankTransferAction(
  _prev: ApproveBankTransferState,
  formData: FormData,
): Promise<ApproveBankTransferState> {
  const manager = await requireCourseManager();
  if (!manager) {
    return { ok: false, error: "Keine Berechtigung." };
  }

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Zahlung nicht gefunden." };

  const now = new Date();

  if (kind === "course") {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: { course: true },
    });
    if (
      !enrollment ||
      enrollment.paymentMethod !== "BANK_TRANSFER" ||
      enrollment.status !== "PENDING"
    ) {
      return { ok: false, error: "Keine offene Überweisung für diesen Kurs." };
    }
    if (!(await canApproveEnrollment(manager.id, enrollment.id))) {
      return { ok: false, error: "Keine Berechtigung für diese Sektion." };
    }

    const group = enrollment.bankTransferGroupId
      ? await prisma.enrollment.findMany({
          where: {
            bankTransferGroupId: enrollment.bankTransferGroupId,
            paymentMethod: "BANK_TRANSFER",
            status: "PENDING",
          },
          include: { course: true },
        })
      : [enrollment];

    for (const item of group) {
      if (item.creditAppliedCents > 0) {
        await finalizeCourseEnrollmentPayments(
          item.purchasedById ?? enrollment.purchasedById ?? manager.id,
          group.map((row) => row.id),
        );
        await prisma.enrollment.updateMany({
          where: { id: { in: group.map((row) => row.id) } },
          data: {
            bankTransferApprovedAt: now,
            bankTransferApprovedById: manager.id,
          },
        });
        break;
      }
      await prisma.enrollment.update({
        where: { id: item.id },
        data: {
          status: "PAID",
          paidAt: now,
          bankTransferApprovedAt: now,
          bankTransferApprovedById: manager.id,
          paidCents: item.paidCents ?? item.course.priceCents,
          ...clearWaitlistOfferData(),
        },
      });
    }

    const groupIds = group.map((row) => row.id);
    if (!group.some((item) => item.creditAppliedCents > 0)) {
      await sendCourseEnrollmentConfirmations(groupIds);
      const { grantBundledPlansForPaidEnrollments } = await import(
        "@/lib/course-bundled-plan"
      );
      await grantBundledPlansForPaidEnrollments(groupIds);
    }

    revalidatePath("/admin/buchhaltung");
    revalidateEnrollmentViews(enrollment.courseId);
    return {
      ok: true,
      message:
        group.length > 1
          ? `${group.length} Kursbuchungen bestätigt.`
          : "Kursbuchung bestätigt.",
    };
  }

  if (kind === "subscription") {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (
      !subscription ||
      subscription.paymentMethod !== "BANK_TRANSFER" ||
      subscription.status !== "PENDING"
    ) {
      return {
        ok: false,
        error: "Keine offene Überweisung für diese Mitgliedschaft.",
      };
    }
    if (!(await canApproveSubscription(manager.id, subscription.id))) {
      return { ok: false, error: "Keine Berechtigung für diese Sektion." };
    }

    const group = subscription.bankTransferGroupId
      ? await prisma.subscription.findMany({
          where: {
            bankTransferGroupId: subscription.bankTransferGroupId,
            paymentMethod: "BANK_TRANSFER",
            status: "PENDING",
          },
          include: { plan: true },
        })
      : [subscription];

    for (const item of group) {
      const paidCents = item.paidCents ?? item.plan.priceCents;
      await activateSubscription(item.id, {
        paidCents,
        paymentSource: "bank_transfer",
      });
      await prisma.subscription.update({
        where: { id: item.id },
        data: {
          bankTransferApprovedAt: now,
          bankTransferApprovedById: manager.id,
        },
      });
    }

    revalidatePath("/admin/buchhaltung");
    revalidatePath("/konto");
    revalidateSubscriptionViews(subscription.planId);
    return {
      ok: true,
      message:
        group.length > 1
          ? `${group.length} Mitgliedschaften freigeschaltet.`
          : "Mitgliedschaft freigeschaltet.",
    };
  }

  return { ok: false, error: "Unbekannte Zahlungsart." };
}
