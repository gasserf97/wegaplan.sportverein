import Link from "next/link";
import type { EnrollmentDocumentKind } from "@/generated/prisma/client";
import { DOCUMENT_KIND_LABELS } from "@/lib/course-documents";
import { cn } from "@/lib/utils";

export function AdminDocumentPreview({
  courseId,
  enrollmentId,
  kind,
  document,
  className,
}: {
  courseId: string;
  enrollmentId: string;
  kind: EnrollmentDocumentKind;
  document: {
    id: string;
    mimeType: string;
    originalName: string;
  } | null;
  className?: string;
}) {
  const label = DOCUMENT_KIND_LABELS[kind];
  if (!document) {
    return (
      <span
        className={cn(
          "inline-flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground",
          className,
        )}
        title={`${label} fehlt`}
      >
        Fehlt
      </span>
    );
  }

  const href = `/api/admin/courses/${courseId}/documents/${enrollmentId}/${kind}`;
  const isImage = document.mimeType.startsWith("image/");

  if (isImage) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "block overflow-hidden rounded-md border border-border bg-muted/30",
          className,
        )}
        title={`${label}: ${document.originalName}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={label}
          className="h-16 w-16 object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-muted/40 px-1 text-center text-[0.65rem] font-medium leading-tight text-foreground hover:bg-muted",
        className,
      )}
      title={`${label}: ${document.originalName}`}
    >
      <span>PDF</span>
      <span className="truncate text-[0.55rem] text-muted-foreground">öffnen</span>
    </a>
  );
}

export function DocumentsFilterLinks({
  courseId,
  active,
  completeCount,
  incompleteCount,
  totalCount,
}: {
  courseId: string;
  active: "alle" | "vollstaendig" | "fehlt";
  completeCount: number;
  incompleteCount: number;
  totalCount: number;
}) {
  const base = `/admin/kurse/${courseId}/anmeldungen`;
  const items = [
    { key: "alle" as const, label: "Alle", count: totalCount },
    {
      key: "vollstaendig" as const,
      label: "Alle Dateien da",
      count: completeCount,
    },
    { key: "fehlt" as const, label: "Dateien fehlen", count: incompleteCount },
  ];

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => {
        const href =
          item.key === "alle" ? base : `${base}?dokumente=${item.key}`;
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={href}
            className={cn(
              "inline-flex h-8 items-center rounded-lg border px-3 text-sm",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {item.label}
            <span
              className={cn(
                "ml-1.5 tabular-nums",
                isActive ? "opacity-90" : "text-muted-foreground",
              )}
            >
              ({item.count})
            </span>
          </Link>
        );
      })}
    </div>
  );
}
