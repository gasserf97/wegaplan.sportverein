"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClubEventAction } from "@/app/actions/club-events";
import { Button } from "@/components/ui/button";

export function DeleteClubEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Hinweis wirklich löschen? Er wird dann niemandem mehr angezeigt.",
            )
          ) {
            return;
          }
          setError(null);
          start(async () => {
            const result = await deleteClubEventAction(eventId);
            if ("error" in result) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Löschen…" : "Löschen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
