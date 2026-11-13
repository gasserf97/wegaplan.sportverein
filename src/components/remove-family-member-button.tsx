"use client";

import { useState, useTransition } from "react";
import { removeFamilyMemberAction } from "@/app/actions/family";
import { Button } from "@/components/ui/button";

export function RemoveFamilyMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid w-fit gap-1 justify-self-start">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`${name} aus der Familie entfernen?`)) return;
          setError(null);
          start(async () => {
            const result = await removeFamilyMemberAction(memberId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "…" : "Mitglied entfernen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
