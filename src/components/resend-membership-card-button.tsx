"use client";

import { useActionState } from "react";
import {
  resendMembershipCardAction,
  type ResendMembershipCardState,
} from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function ResendMembershipCardButton({
  subscriptionId,
  compact = false,
}: {
  subscriptionId: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    ResendMembershipCardState,
    FormData
  >(resendMembershipCardAction, null);

  const buttonClass = compact
    ? "h-7 px-2.5 text-[0.8rem]"
    : undefined;
  const linkClass = compact
    ? "inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
    : "inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted";

  return (
    <form action={formAction} className="print:hidden">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={buttonClass}
          disabled={pending}
        >
          {pending
            ? t("account.resendMembershipCardPending")
            : compact
              ? t("account.resendConfirmationAgain")
              : t("account.resendMembershipCard")}
        </Button>
        <a
          href={`/api/subscriptions/${subscriptionId}/membership-card`}
          download
          className={linkClass}
        >
          {compact
            ? t("account.downloadConfirmation")
            : t("account.downloadMembershipCard")}
        </a>
      </div>
      {state?.ok === true ? (
        <p className="mt-2 text-sm text-green-700">{state.message}</p>
      ) : null}
      {state?.ok === false ? (
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
