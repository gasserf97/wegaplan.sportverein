"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { markClubEventReadAction } from "@/app/actions/club-events";
import { Button } from "@/components/ui/button";

export function ClubEventNotice({
  eventId,
  body,
  imageUrl,
  imageAlt,
  label,
  pendingLabel,
}: {
  eventId: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string;
  label: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [state, formAction, pending] = useActionState<
    { ok: true } | { error: string } | null,
    FormData
  >(markClubEventReadAction, null);

  useEffect(() => {
    if (state && "ok" in state) {
      setHidden(true);
      router.refresh();
    }
  }, [state, router]);

  if (hidden) return null;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="grid min-w-0 flex-1 gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={body.trim() ? "" : imageAlt}
            className="max-h-96 w-full rounded-lg object-contain"
          />
        ) : null}
        {body.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {body}
          </p>
        ) : null}
      </div>
      <form action={formAction} className="grid shrink-0 gap-1">
        <input type="hidden" name="eventId" value={eventId} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
        {state && "error" in state ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
      </form>
    </article>
  );
}
