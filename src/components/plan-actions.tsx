"use client";

import { useState, useTransition } from "react";
import { deletePlanAction, togglePlanPublishedAction } from "@/app/actions/subscriptions";
import { Button } from "@/components/ui/button";

export function TogglePlanPublishedButton({
  planId,
  published,
}: {
  planId: string;
  published: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await togglePlanPublishedAction(planId);
        });
      }}
    >
      {published ? "Zurückziehen" : "Veröffentlichen"}
    </Button>
  );
}

export function DeletePlanButton({
  planId,
  canDelete,
}: {
  planId: string;
  canDelete: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canDelete) {
    return (
      <p className="text-xs text-muted-foreground">
        Löschen erst möglich, wenn niemand eingeschrieben ist.
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Mitgliedschaft wirklich löschen?")) return;
          setError(null);
          start(async () => {
            const result = await deletePlanAction(planId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Löschen…" : "Löschen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
