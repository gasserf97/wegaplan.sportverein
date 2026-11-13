"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOwnAccountAction } from "@/app/actions/delete-own-account";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/locale-provider";

export function DeleteOwnAccountSection({
  minorNames,
  isHouseholdRoot,
}: {
  minorNames: string[];
  isHouseholdRoot: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [includeMinors, setIncludeMinors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mustChooseMinors = isHouseholdRoot && minorNames.length > 0;

  function submit(include: boolean) {
    const confirmMessage = include
      ? t("account.deleteConfirmWithMinors", {
          names: minorNames.join(", "),
        })
      : t("account.deleteConfirmSelf");
    if (!window.confirm(confirmMessage)) return;

    setError(null);
    start(async () => {
      const result = await deleteOwnAccountAction(include);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (result && "ok" in result) {
        router.push(result.next);
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-12 rounded-xl border border-destructive/30 bg-card p-5">
      <h2 className="text-lg font-medium text-destructive">
        {t("account.deleteTitle")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("account.deleteHint")}
      </p>

      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setOpen(true)}
        >
          {t("account.deleteOpen")}
        </Button>
      ) : (
        <div className="mt-4 grid gap-3">
          {mustChooseMinors ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("account.deleteMinorsPrompt", {
                  names: minorNames.join(", "),
                })}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="deleteScope"
                  className="mt-1 size-4 accent-primary"
                  checked={!includeMinors}
                  onChange={() => setIncludeMinors(false)}
                />
                <span>{t("account.deleteOnlySelf")}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="deleteScope"
                  className="mt-1 size-4 accent-primary"
                  checked={includeMinors}
                  onChange={() => setIncludeMinors(true)}
                />
                <span>{t("account.deleteWithMinors")}</span>
              </label>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={pending}
              onClick={() => submit(mustChooseMinors ? includeMinors : false)}
            >
              {pending ? t("common.pleaseWait") : t("account.deleteConfirmBtn")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setError(null);
                setIncludeMinors(false);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : null}
    </section>
  );
}
