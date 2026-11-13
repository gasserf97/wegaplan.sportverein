"use client";

import { useState, useTransition } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist";
import { type FamilyBuyer } from "@/components/family-purchase";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";

export function WaitlistPanel({
  courseId,
  people,
  requiresAttest,
  waitlistSpotsLeft,
}: {
  courseId: string;
  people: FamilyBuyer[];
  requiresAttest: boolean;
  waitlistSpotsLeft: number;
}) {
  const { t } = useI18n();
  const selectable = people.filter(
    (person) =>
      !person.alreadyHas && !person.ineligibleReason && person.hasMembership,
  );
  const [selected, setSelected] = useState<string[]>(
    selectable.map((p) => p.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  if (success) {
    return (
      <p className="rounded-lg bg-secondary px-3 py-2 text-sm">{success}</p>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Kurs ausgebucht. Warteliste: noch {waitlistSpotsLeft} von 5 Plätzen frei.
        Bei Nachrücken zahlen Sie den zum Eintragungszeitpunkt je Person
        angezeigten Preis.
      </p>
      {requiresAttest ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          {t("courses.attestUploadLater")}
        </p>
      ) : null}
      <ul className="grid gap-2">
        {people.map((person) => {
          const blocked =
            person.alreadyHas ||
            Boolean(person.ineligibleReason) ||
            !person.hasMembership;
          return (
            <li key={person.id}>
              <label
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  blocked
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={selected.includes(person.id)}
                  disabled={blocked}
                  onChange={() => toggle(person.id)}
                />
                <span className="font-medium">
                  {person.name}
                  {person.isSelf ? ` ${t("common.you")}` : ""}
                  {" · "}
                  {person.priceCents === 0
                    ? t("common.free")
                    : formatEuro(person.priceCents)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        size="lg"
        disabled={pending || selected.length === 0}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await joinWaitlistAction(courseId, selected);
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            if (result && "ok" in result) {
              setSuccess(result.message);
            }
          });
        }}
      >
        {pending ? t("courses.joining") : t("courses.joinWaitlist")}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
