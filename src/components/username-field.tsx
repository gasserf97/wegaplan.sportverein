"use client";

import { useEffect, useRef, useState } from "react";
import { checkUsernameAvailabilityAction } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { UsernameAvailability } from "@/lib/username";

function usernameHintText(availability: UsernameAvailability) {
  switch (availability.state) {
    case "checking":
      return "Prüfe Verfügbarkeit…";
    case "available":
      return "Benutzername ist frei.";
    case "taken":
      return "Benutzername ist bereits vergeben.";
    case "invalid":
      return availability.message;
    default:
      return null;
  }
}

function usernameHintClass(availability: UsernameAvailability) {
  switch (availability.state) {
    case "available":
      return "text-sm text-emerald-600 dark:text-emerald-400";
    case "taken":
    case "invalid":
      return "text-sm text-destructive";
    case "checking":
      return "text-sm text-muted-foreground";
    default:
      return "";
  }
}

export function UsernameField({
  defaultValue,
  excludeUserId,
  onBlockedChange,
  id = "username",
}: {
  defaultValue?: string;
  excludeUserId?: string;
  onBlockedChange: (blocked: boolean) => void;
  id?: string;
}) {
  const [username, setUsername] = useState(defaultValue ?? "");
  const [availability, setAvailability] = useState<UsernameAvailability>({
    state: "empty",
  });
  const requestId = useRef(0);
  const hintId = `${id}-hint`;

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setAvailability({ state: "empty" });
      onBlockedChange(false);
      return;
    }

    setAvailability({ state: "checking" });
    const currentId = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await checkUsernameAvailabilityAction(username, excludeUserId);
      if (requestId.current !== currentId) return;
      setAvailability(result);
      onBlockedChange(result.state === "taken" || result.state === "invalid");
    }, 400);

    return () => clearTimeout(timer);
  }, [username, excludeUserId, onBlockedChange]);

  const hint = usernameHintText(availability);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} required>
        Benutzername
      </Label>
      <Input
        id={id}
        name="username"
        autoComplete="username"
        minLength={3}
        maxLength={32}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        required
        aria-describedby={hintId}
        aria-invalid={
          availability.state === "taken" || availability.state === "invalid"
        }
      />
      <p
        id={hintId}
        className={cn(
          "min-h-5 text-sm leading-5",
          hint ? usernameHintClass(availability) : "invisible",
        )}
        aria-live="polite"
      >
        {hint ?? "\u00a0"}
      </p>
    </div>
  );
}
