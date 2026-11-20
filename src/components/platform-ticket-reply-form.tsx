"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  replyPlatformTicketAction,
  type ReplyPlatformTicketState,
} from "@/app/actions/platform-tickets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PlatformTicketReplyForm({
  ticketId,
}: {
  ticketId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ReplyPlatformTicketState,
    FormData
  >(replyPlatformTicketAction, null);

  useEffect(() => {
    if (state && "ok" in state) router.refresh();
  }, [state, router]);

  return (
    <form
      key={state && "ok" in state ? "sent" : "edit"}
      action={formAction}
      className="grid gap-2"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <Label htmlFor={`platform-reply-${ticketId}`}>Antwort an den Verein</Label>
      <Textarea
        id={`platform-reply-${ticketId}`}
        name="body"
        required
        minLength={5}
        maxLength={5000}
        rows={4}
        placeholder="Diese Antwort sehen die Admins des Vereins."
        className="min-h-24 resize-y"
      />
      {state && "ok" in state ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Antwort ist im Verein unter Tickets sichtbar.
        </p>
      ) : null}
      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Senden…" : "An den Verein senden"}
        </Button>
      </div>
    </form>
  );
}
