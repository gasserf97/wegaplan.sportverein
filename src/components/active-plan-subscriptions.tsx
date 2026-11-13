"use client";

import { AutoRenewToggle } from "@/components/auto-renew-toggle";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/locale-provider";
import { formatDate, formatDateTime, formatEuro } from "@/lib/format";
import {
  intervalMeta,
  joinMetaParts,
  subscriptionStatusMeta,
  subscriptionValidityLabels,
} from "@/lib/subscriptions";
import type { PlanKind, SubscriptionInterval } from "@/generated/prisma/client";

export type ActivePlanSubscriptionItem = {
  subscriptionId: string;
  memberName: string;
  showMemberName: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  autoRenew: boolean;
  paidCents: number;
  priceCents: number;
  autoRenewOffered: boolean;
};

export function ActivePlanSubscriptions({
  items,
  interval,
}: {
  items: ActivePlanSubscriptionItem[];
  interval: SubscriptionInterval;
  planKind: PlanKind;
}) {
  const { locale, t } = useI18n();

  if (items.length === 0) return null;

  const billing = intervalMeta(interval, t);
  const stamp = (date: Date) =>
    interval === "MINUTELY" || interval === "DAILY"
      ? formatDateTime(date, locale)
      : formatDate(date, locale);

  return (
    <ul className="grid gap-3">
      {items.map((item) => {
        const labels = subscriptionValidityLabels(
          interval,
          item.periodStart,
          item.periodEnd,
          item.paidAt,
          t,
        );
        const line = joinMetaParts([
          `${formatEuro(item.paidCents ?? item.priceCents, locale)} ${billing.per}`,
          subscriptionStatusMeta(t, {
            since: labels.since,
            until: labels.until,
            autoRenew: item.autoRenew,
            renewDateLabel: item.periodEnd ? stamp(item.periodEnd) : null,
          }),
        ]);
        return (
          <li
            key={item.subscriptionId}
            className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              {item.showMemberName ? (
                <p className="font-medium">{item.memberName}</p>
              ) : null}
              {line ? (
                <p
                  className={`text-sm leading-6 text-muted-foreground ${
                    item.showMemberName ? "mt-1" : ""
                  }`}
                >
                  {line}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">{t("subscriptions.badgeActive")}</Badge>
              {item.autoRenewOffered || item.autoRenew ? (
                <AutoRenewToggle
                  subscriptionId={item.subscriptionId}
                  autoRenew={item.autoRenew}
                  offered={item.autoRenewOffered}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
