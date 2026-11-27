"use client";

import { useActionState } from "react";
import type { PlatformState } from "@/app/actions/platform";

type Field = {
  name: string;
  label: string;
  type?: string;
  hint?: string;
  defaultValue?: string;
};

type Check = { name: string; label: string; defaultChecked?: boolean };

function FieldList({ fields }: { fields: Field[] }) {
  return fields.map((field) => (
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
  ));
}

function CheckList({ checks }: { checks: Check[] }) {
  return checks.map((check) => (
    <label key={check.name} className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={check.name} defaultChecked={check.defaultChecked} />
      {check.label}
    </label>
  ));
}

export function PlatformForm({
  action,
  submitLabel,
  fields,
  checks = [],
  collapsed,
}: {
  action: (prev: PlatformState, formData: FormData) => Promise<PlatformState>;
  submitLabel: string;
  fields: Field[];
  checks?: Check[];
  collapsed?: {
    title: string;
    hint?: string;
    open?: boolean;
    fields?: Field[];
    checks?: Check[];
  };
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid gap-3">
      <FieldList fields={fields} />
      <CheckList checks={checks} />
      {collapsed ? (
        <details
          className="rounded-md border border-border bg-background/60 px-3 py-2"
          open={collapsed.open}
        >
          <summary className="cursor-pointer select-none text-sm font-medium">
            {collapsed.title}
          </summary>
          {collapsed.hint ? (
            <p className="mt-2 text-xs text-muted-foreground">{collapsed.hint}</p>
          ) : null}
          <div className="mt-3 grid gap-3">
            <FieldList fields={collapsed.fields ?? []} />
            <CheckList checks={collapsed.checks ?? []} />
          </div>
        </details>
      ) : null}
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
