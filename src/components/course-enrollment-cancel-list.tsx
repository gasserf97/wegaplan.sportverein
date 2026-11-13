import { CancelEnrollmentButton } from "@/components/cancel-enrollment-button";
import { Badge } from "@/components/ui/badge";
import {
  canCancelCourseEnrollment,
  courseCancelBlockedMessage,
} from "@/lib/courses";
import {
  accountingAmountCents,
  enrollmentCreditRefundCents,
} from "@/lib/payment-amounts";
import { formatDate, formatDateTime, formatEuro } from "@/lib/format";
import { waitlistOfferUrl } from "@/lib/waitlist";
import Link from "next/link";

type CourseEnrollmentRow = {
  id: string;
  status: string;
  paidCents: number | null;
  creditAppliedCents: number;
  paymentMethod: "STRIPE" | "BANK_TRANSFER" | null;
  stripeSessionId: string | null;
  paidAt: Date | null;
  userId: string;
  waitlistOfferToken: string | null;
  offerExpiresAt: Date | null;
  user: { name: string };
};

export function CourseEnrollmentCancelList({
  enrollments,
  course,
  viewerUserId,
}: {
  enrollments: CourseEnrollmentRow[];
  course: {
    id: string;
    title: string;
    priceCents: number;
    startsAt: Date | null;
    cancelDeadlineDaysBeforeStart: number | null;
    requiresMedicalCertificate: boolean;
  };
  viewerUserId: string;
}) {
  if (enrollments.length === 0) return null;

  return (
    <div className="mb-6 grid gap-3 border-b border-border pb-6">
      <h3 className="text-sm font-medium">Ihre Anmeldungen</h3>
      <ul className="grid gap-3">
        {enrollments.map((item) => {
          const chargedCents = accountingAmountCents(
            item.paidCents,
            course.priceCents,
            item.status === "PENDING",
          );
          const enrollmentCanCancel =
            item.status === "WAITLISTED" ||
            canCancelCourseEnrollment(
              course.startsAt,
              course.cancelDeadlineDaysBeforeStart,
            );
          const refundCents =
            item.status === "PAID"
              ? enrollmentCreditRefundCents({
                  paidCents: item.paidCents,
                  creditAppliedCents: item.creditAppliedCents,
                  course,
                })
              : item.status === "PENDING" &&
                  item.paymentMethod === "BANK_TRANSFER" &&
                  item.creditAppliedCents > 0
                ? item.creditAppliedCents
                : 0;

          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {item.userId !== viewerUserId ? item.user.name : "Sie"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatEuro(chargedCents)}
                    {item.paidAt ? ` · bezahlt am ${formatDate(item.paidAt)}` : null}
                    {item.creditAppliedCents > 0
                      ? ` · davon ${formatEuro(item.creditAppliedCents)} Guthaben`
                      : null}
                  </p>
                </div>
                <Badge variant={item.status === "PAID" ? "default" : "secondary"}>
                  {item.status === "PAID"
                    ? "Bezahlt"
                    : item.status === "WAITLISTED"
                      ? "Warteliste"
                      : item.waitlistOfferToken && item.offerExpiresAt
                        ? "Platz reserviert"
                        : course.requiresMedicalCertificate && item.status === "PENDING"
                          ? "Zahlung ausstehend"
                          : "Zahlung ausstehend"}
                </Badge>
              </div>
              {item.waitlistOfferToken &&
              item.offerExpiresAt &&
              item.offerExpiresAt > new Date() ? (
                <Link
                  href={waitlistOfferUrl(course.id, item.id, item.waitlistOfferToken)}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Platz jetzt sichern (bis {formatDateTime(item.offerExpiresAt)})
                </Link>
              ) : null}
              <CancelEnrollmentButton
                enrollmentId={item.id}
                courseTitle={course.title}
                canCancel={enrollmentCanCancel}
                cancelBlockedMessage={courseCancelBlockedMessage(
                  course.cancelDeadlineDaysBeforeStart,
                  course.startsAt,
                )}
                refundCents={refundCents}
                paymentMethod={item.paymentMethod}
                paidByCard={
                  item.paymentMethod === "STRIPE" ||
                  (item.paymentMethod !== "BANK_TRANSFER" &&
                    Boolean(item.stripeSessionId))
                }
                waitlisted={item.status === "WAITLISTED"}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
