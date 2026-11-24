"use client";

import { useActionState } from "react";
import {
  importMembersAction,
  type MemberImportState,
} from "@/app/actions/member-import";
import { Button } from "@/components/ui/button";

export function MemberImportForm() {
  const [state, formAction, pending] = useActionState<MemberImportState, FormData>(
    importMembersAction,
    null,
  );

  return (
    <form action={formAction} className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl">Excel importieren</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Dieselbe Familiennummer gehört zu einem Haushalt. Genau eine Zeile ist
        Kontoinhaber (Ja), die übrigen werden Angehörige. Personen, die schon
        vorhanden sind, werden an der Steuernummer erkannt, sonst an der E-Mail,
        und nicht doppelt angelegt. Wer schon in einer anderen Familie steckt,
        bleibt dort.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="max-w-full text-sm"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Import…" : "Importieren"}
        </Button>
        <a
          href="/api/admin/members/import-template"
          className="text-sm underline"
        >
          Vorlage herunterladen
        </a>
      </div>
      {state && "error" in state ? (
        <p className="mt-3 text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <div className="mt-3 text-sm">
          <p>
            {state.result.created} neu, {state.result.updated} aktualisiert,{" "}
            {state.result.linked} der Familie zugeordnet.
          </p>
          {state.result.notices.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              {state.result.notices.slice(0, 20).map((notice) => (
                <li key={`${notice.row}-${notice.message}`}>
                  Zeile {notice.row}: {notice.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
