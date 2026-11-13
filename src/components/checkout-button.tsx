"use client";

import { useState, useTransition } from "react";
import { startCheckoutAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";

export function CheckoutButton({
  courseId,
  label,
}: {
  courseId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await startCheckoutAction(courseId);
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            if (result && "url" in result) {
              window.location.assign(result.url);
            }
          });
        }}
      >
        {pending ? "Weiterleitung…" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
