import {
  membershipPeriodYear,
  resolveMembershipCardTitle,
} from "@/lib/confirmation-title";
import { formatDate, formatDateTime } from "@/lib/format";

export type MembershipCardData = {
  name: string;
  memberNo: string;
  birthDate: Date;
  cardTitle: string;
  planTitle: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  interval?: string | null;
};

export function buildMembershipCardData(input: {
  userId: string;
  name: string;
  birthDate: Date;
  planTitle: string;
  confirmationTitle?: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  interval?: string | null;
}): MembershipCardData {
  return {
    name: input.name,
    memberNo: membershipNumber(input.userId),
    birthDate: input.birthDate,
    cardTitle: resolveMembershipCardTitle(
      input.confirmationTitle,
      undefined,
      membershipPeriodYear(input.periodStart, input.periodEnd),
    ),
    planTitle: input.planTitle,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    interval: input.interval,
  };
}

export function membershipNumber(userId: string) {
  const short = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `ASC-${short || "000000"}`;
}

export function validityLabel(
  periodStart: Date | null,
  periodEnd: Date | null,
  interval?: string | null,
) {
  if (periodEnd) {
    if (interval === "YEARLY_CALENDAR") {
      const year = membershipPeriodYear(periodStart, periodEnd);
      if (year != null) return `gültig bis 31.12.${year}`;
    }
    const shortLived =
      periodStart != null &&
      periodEnd.getTime() - periodStart.getTime() < 2 * 60 * 60 * 1000;
    const stamp = shortLived ? formatDateTime(periodEnd) : formatDate(periodEnd);
    return `gültig bis ${stamp}`;
  }
  if (periodStart) return `gültig ab ${formatDate(periodStart)}`;
  return "gültig";
}
