"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTaxId, isPendingTaxId } from "@/lib/profile";

type TaxIdFieldProps = {
  id?: string;
  name?: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
};

function sanitizeTaxIdDefault(value: string | undefined) {
  if (!value?.trim() || isPendingTaxId(value)) return "";
  return value.trim();
}

export function TaxIdField({
  id,
  name = "taxId",
  label,
  defaultValue = "",
  required = true,
}: TaxIdFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `tax-id-${autoId}`;
  const [value, setValue] = useState(() => sanitizeTaxIdDefault(defaultValue));
  const [touched, setTouched] = useState(false);

  const normalizedLength = value.trim().replace(/[\s./-]/g, "").length;
  const isValid = Boolean(parseTaxId(value));
  const showError = touched && value.trim().length > 0 && !isValid;

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId} required={required}>
        {label}
      </Label>
      <Input
        id={fieldId}
        name={name}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.target.value.toUpperCase())}
        onBlur={() => setTouched(true)}
        maxLength={20}
        aria-invalid={showError}
        required={required}
      />
      <p
        className={`min-h-5 text-sm leading-5 ${
          showError ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {showError
          ? "Steuernummer ist nicht gültig."
          : `${normalizedLength}/16 Zeichen`}
      </p>
    </div>
  );
}
