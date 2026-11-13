import { checkoutHoldSince } from "@/lib/checkout-hold";
import { prisma } from "@/lib/prisma";
import { clearWaitlistOfferData } from "@/lib/waitlist";

const cancelledEnrollmentData = {
  status: "CANCELLED" as const,
  creditAppliedCents: 0,
  paidCents: null,
  paymentMethod: null,
  paymentReference: null,
  bankTransferGroupId: null,
  bankTransferApprovedAt: null,
  bankTransferApprovedById: null,
  stripeSessionId: null,
  paidAt: null,
  ...clearWaitlistOfferData(),
};

export async function expireStalePendingEnrollments() {
  const holdSince = checkoutHoldSince();
  await prisma.enrollment.updateMany({
    where: {
      status: "PENDING",
      paymentMethod: { not: "BANK_TRANSFER" },
      waitlistOfferToken: null,
      createdAt: { lt: holdSince },
    },
    data: cancelledEnrollmentData,
  });
}

const cancelledSubscriptionData = {
  status: "CANCELLED" as const,
  creditAppliedCents: 0,
  paidCents: null,
  paymentMethod: null,
  paymentReference: null,
  bankTransferGroupId: null,
  bankTransferApprovedAt: null,
  bankTransferApprovedById: null,
  stripeSessionId: null,
  paidAt: null,
  autoRenew: false,
};

const cancelledDeviceReservationData = {
  status: "CANCELLED" as const,
  creditAppliedCents: 0,
  paidAt: null,
  stripeSessionId: null,
};

export async function expireStalePendingSubscriptions() {
  const holdSince = checkoutHoldSince();
  await prisma.subscription.updateMany({
    where: {
      status: "PENDING",
      paymentMethod: { not: "BANK_TRANSFER" },
      createdAt: { lt: holdSince },
    },
    data: cancelledSubscriptionData,
  });
}

export async function expireStalePendingDeviceReservations() {
  const holdSince = checkoutHoldSince();
  await prisma.deviceReservation.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: holdSince },
    },
    data: cancelledDeviceReservationData,
  });
}

export async function cancelPendingEnrollmentsByStripeSession(stripeSessionId: string) {
  await prisma.enrollment.updateMany({
    where: {
      stripeSessionId,
      status: "PENDING",
      paymentMethod: { not: "BANK_TRANSFER" },
    },
    data: cancelledEnrollmentData,
  });
}

export async function cancelPendingSubscriptionsByStripeSession(stripeSessionId: string) {
  await prisma.subscription.updateMany({
    where: {
      stripeSessionId,
      status: "PENDING",
      paymentMethod: { not: "BANK_TRANSFER" },
    },
    data: cancelledSubscriptionData,
  });
}

export async function cancelPendingDeviceReservationsByStripeSession(stripeSessionId: string) {
  await prisma.deviceReservation.updateMany({
    where: {
      stripeSessionId,
      status: "PENDING",
    },
    data: cancelledDeviceReservationData,
  });
}

export { cancelledEnrollmentData, cancelledSubscriptionData, cancelledDeviceReservationData };
