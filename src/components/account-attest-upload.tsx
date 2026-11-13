"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EnrollmentDocumentKind } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCUMENT_KIND_LABELS } from "@/lib/course-documents";

export function AccountDocumentUpload({
  enrollmentId,
  kind,
  uploadLabel,
  uploadingLabel,
  uploadFailedLabel,
}: {
  enrollmentId: string;
  kind: EnrollmentDocumentKind;
  uploadLabel?: string;
  uploadingLabel: string;
  uploadFailedLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = uploadLabel ?? `${DOCUMENT_KIND_LABELS[kind]} hochladen`;

  return (
    <form
      className="grid w-full max-w-xs gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set("kind", kind);
        start(async () => {
          setError(null);
          const response = await fetch(
            `/api/enrollments/${enrollmentId}/documents`,
            {
              method: "POST",
              body: formData,
            },
          );
          const result = (await response.json()) as
            | { ok: true; fileName: string }
            | { error: string };
          if (!response.ok || "error" in result) {
            setError("error" in result ? result.error : uploadFailedLabel);
            return;
          }
          form.reset();
          router.refresh();
        });
      }}
    >
      <Input
        type="file"
        name="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        required
        className="text-xs"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? uploadingLabel : label}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

/** @deprecated Prefer AccountDocumentUpload with kind */
export function AccountAttestUpload({
  enrollmentId,
  uploadLabel,
  uploadingLabel,
  uploadFailedLabel,
}: {
  enrollmentId: string;
  uploadLabel: string;
  uploadingLabel: string;
  uploadFailedLabel: string;
}) {
  return (
    <AccountDocumentUpload
      enrollmentId={enrollmentId}
      kind="MEDICAL_CERTIFICATE"
      uploadLabel={uploadLabel}
      uploadingLabel={uploadingLabel}
      uploadFailedLabel={uploadFailedLabel}
    />
  );
}
