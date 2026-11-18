"use client";

import { useActionState } from "react";
import type { PlatformState } from "@/app/actions/platform";

export function PlatformForm({
  action,
  submitLabel,
  fields,
  checks = [],
}: {
  action: (prev: PlatformState, formData: FormData) => Promise<PlatformState>;
  submitLabel: string;
  fields: { name: string; label: string; type?: string; hint?: string; defaultValue?: string }[];
  checks?: { name: string; label: string; defaultChecked?: boolean }[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid gap-3">
      {fields.map((field) => (
        <label key={field.name} className="grid gap-1 text-sm">
          <span className="font-medium">{field.label}</span>
          <input
            name={field.name}
            type={field.type ?? "text"}
            defaultValue={field.defaultValue}
            className="h-9 rounded-md border border-border bg-background px-3"
            autoComplete="off"
          />
          {field.hint ? (
            <span className="text-xs text-muted-foreground">{field.hint}</span>
          ) : null}
        </label>
      ))}
      {checks.map((check) => (
        <label key={check.name} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={check.name} defaultChecked={check.defaultChecked} />
          {check.label}
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Speichern…" : submitLabel}
      </button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
