"use client";

import { useActionState } from "react";
import {
  resendCourseConfirmationAction,
  type ResendCourseConfirmationState,
} from "@/app/actions/resend-course-confirmation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function ResendCourseConfirmationButton({
  enrollmentId,
  alreadySent,
}: {
  enrollmentId: string;
  alreadySent: boolean;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<
    ResendCourseConfirmationState,
    FormData
  >(resendCourseConfirmationAction, null);

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[0.8rem]"
          disabled={pending}
        >
          {pending
            ? t("account.resendConfirmationPending")
            : alreadySent
              ? t("account.resendConfirmationAgain")
              : t("account.resendConfirmation")}
        </Button>
        <a
          href={`/api/enrollments/${enrollmentId}/confirmation`}
          download
          className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
        >
          {t("account.downloadConfirmation")}
        </a>
      </div>
      {state && "ok" in state && state.ok ? (
        <p className="text-[0.7rem] text-emerald-700">{state.message}</p>
      ) : null}
      {state && "error" in state ? (
        <p className="text-[0.7rem] text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
