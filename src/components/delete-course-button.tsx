"use client";

import { useState, useTransition } from "react";
import { deleteCourseAction } from "@/app/actions/courses";
import { Button } from "@/components/ui/button";

export function DeleteCourseButton({
  courseId,
  canDelete,
}: {
  courseId: string;
  canDelete: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canDelete) {
    return (
      <p className="text-xs text-muted-foreground">
        Löschen erst möglich, wenn niemand eingeschrieben ist.
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Kurs wirklich löschen? Das lässt sich nicht rückgängig machen.")) {
            return;
          }
          setError(null);
          start(async () => {
            const result = await deleteCourseAction(courseId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Löschen…" : "Löschen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
