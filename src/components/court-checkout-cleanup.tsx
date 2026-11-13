"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { abandonPendingCourtCheckoutAction } from "@/app/actions/court-checkout";
import { abandonPendingDeviceCheckoutAction } from "@/app/actions/devices";
import {
  abandonPendingCourseCheckoutAction,
  abandonPendingSubscriptionCheckoutAction,
} from "@/app/actions/pending-checkout";

export const COURT_PENDING_CHECKOUT_KEY = "courtPendingCheckout";

export const DEVICE_PENDING_CHECKOUT_KEY = "devicePendingCheckout";

export const COURSE_PENDING_CHECKOUT_KEY = "coursePendingCheckout";

export const SUBSCRIPTION_PENDING_CHECKOUT_KEY = "subscriptionPendingCheckout";

export function rememberCourtPendingCheckout(reservationId: string) {
  sessionStorage.setItem(COURT_PENDING_CHECKOUT_KEY, reservationId);
}

export function rememberDevicePendingCheckout(reservationId: string) {
  sessionStorage.setItem(DEVICE_PENDING_CHECKOUT_KEY, reservationId);
}

export function rememberCoursePendingCheckout(courseId: string) {
  sessionStorage.setItem(COURSE_PENDING_CHECKOUT_KEY, courseId);
}

export function rememberSubscriptionPendingCheckout(planId: string) {
  sessionStorage.setItem(SUBSCRIPTION_PENDING_CHECKOUT_KEY, planId);
}

export function clearPendingCheckoutStorage() {
  sessionStorage.removeItem(COURT_PENDING_CHECKOUT_KEY);
  sessionStorage.removeItem(DEVICE_PENDING_CHECKOUT_KEY);
  sessionStorage.removeItem(COURSE_PENDING_CHECKOUT_KEY);
  sessionStorage.removeItem(SUBSCRIPTION_PENDING_CHECKOUT_KEY);
}

export function CourtCheckoutCleanup() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const reservationId = sessionStorage.getItem(COURT_PENDING_CHECKOUT_KEY);
    if (!reservationId) return;
    sessionStorage.removeItem(COURT_PENDING_CHECKOUT_KEY);
    void abandonPendingCourtCheckoutAction(reservationId).then(() => {
      router.refresh();
    });
  }, [router]);
  return null;
}

export function DeviceCheckoutCleanup() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const reservationId = sessionStorage.getItem(DEVICE_PENDING_CHECKOUT_KEY);
    if (!reservationId) return;
    sessionStorage.removeItem(DEVICE_PENDING_CHECKOUT_KEY);
    void abandonPendingDeviceCheckoutAction(reservationId).then(() => {
      router.refresh();
    });
  }, [router]);
  return null;
}

export function CourseCheckoutCleanup() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const courseId = sessionStorage.getItem(COURSE_PENDING_CHECKOUT_KEY);
    if (!courseId) return;
    sessionStorage.removeItem(COURSE_PENDING_CHECKOUT_KEY);
    void abandonPendingCourseCheckoutAction(courseId).then(() => {
      router.refresh();
    });
  }, [router]);
  return null;
}

export function SubscriptionCheckoutCleanup() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const planId = sessionStorage.getItem(SUBSCRIPTION_PENDING_CHECKOUT_KEY);
    if (!planId) return;
    sessionStorage.removeItem(SUBSCRIPTION_PENDING_CHECKOUT_KEY);
    void abandonPendingSubscriptionCheckoutAction(planId).then(() => {
      router.refresh();
    });
  }, [router]);
  return null;
}

export function CheckoutSuccessCleanup() {
  useEffect(() => {
    clearPendingCheckoutStorage();
  }, []);
  return null;
}
/** @deprecated Use CheckoutSuccessCleanup */

export const CourtCheckoutSuccessCleanup = CheckoutSuccessCleanup;
