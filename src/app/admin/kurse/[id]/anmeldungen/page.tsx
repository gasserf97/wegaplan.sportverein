import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AdminDocumentPreview,
  DocumentsFilterLinks,
} from "@/components/admin-document-preview";
import { ResendCourseConfirmationButton } from "@/components/resend-course-confirmation-button";
import { RemoveCourseEnrollmentButton } from "@/components/remove-course-enrollment-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellActions,
  tableCellTruncate,
  tableHeadActions,
} from "@/components/ui/table";
import { requireCourseManager } from "@/lib/auth";
import {
  courseDocumentRequirements,
  DOCUMENT_KIND_LABELS,
  enrollmentHasAllRequiredDocuments,
  hasMedicalCertificate,
  medicalCertificateDocument,
} from "@/lib/course-documents";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n";
import { canManageCourse } from "@/lib/permissions";
import { coursePriceSummary } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { registrationPaymentLabel } from "@/lib/registration-payment";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Kurs-Anmeldungen" };

type DocumentsFilter = "alle" | "vollstaendig" | "fehlt";

function parseDocumentsFilter(value: string | undefined): DocumentsFilter {
  if (value === "vollstaendig" || value === "fehlt") return value;
  return "alle";
}

export default async function CourseEnrollmentsAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dokumente?: string }>;
}) {
  const { t } = await getServerI18n();
  const manager = await requireCourseManager();
  if (!manager) redirect("/anmelden?next=/admin");

  const { id } = await params;
  const { dokumente: dokumenteParam } = await searchParams;
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) notFound();
  if (!(await canManageCourse(manager.id, course))) redirect("/admin");

  const enrollments = await prisma.enrollment.findMany({
    where: {
      courseId: course.id,
      OR: [
        { status: "PAID" },
        { status: "WAITLISTED" },
        { status: "PENDING", paymentMethod: "BANK_TRANSFER" },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      purchasedBy: { select: { name: true } },
      documents: true,
    },
  });

  const documentRequirements = courseDocumentRequirements(course);
  const showDocuments = documentRequirements.length > 0;
  const documentsFilter = showDocuments
    ? parseDocumentsFilter(dokumenteParam)
    : "alle";

  const enrollmentsWithStatus = enrollments.map((item) => ({
    ...item,
    allDocumentsComplete: enrollmentHasAllRequiredDocuments(
      course,
      item.documents,
    ),
  }));

  const completeCount = enrollmentsWithStatus.filter(
    (item) => item.allDocumentsComplete,
  ).length;
  const incompleteCount = enrollmentsWithStatus.length - completeCount;

  const visibleEnrollments =
    !showDocuments || documentsFilter === "alle"
      ? enrollmentsWithStatus
      : documentsFilter === "vollstaendig"
        ? enrollmentsWithStatus.filter((item) => item.allDocumentsComplete)
        : enrollmentsWithStatus.filter((item) => !item.allDocumentsComplete);

  const withAttest = enrollments.filter((item) =>
    hasMedicalCertificate(item.documents),
  );
  const paidMissingConfirmation = enrollments.filter(
    (item) => item.status === "PAID" && !item.confirmationEmailSentAt,
  ).length;

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-12 sm:px-6">
      <Link href="/admin" className="text-sm underline">
        ← Kursverwaltung
      </Link>
      {" · "}
      <Link href={`/admin/kurse/${course.id}`} className="text-sm underline">
        Kurs bearbeiten
      </Link>
      <h1 className="mt-4 text-4xl">Anmeldungen</h1>
      <p className="mt-2 text-muted-foreground">{course.title}</p>

      <p className="mt-2 text-sm text-muted-foreground">
        Die Einzahlungsbestätigung geht per E-Mail raus, sobald die Buchung
        bezahlt bzw. freigeschaltet ist
        {paidMissingConfirmation > 0
          ? ` – ${paidMissingConfirmation} bezahlte Anmeldung(en) ohne versendete Bestätigung.`
          : "."}
      </p>

      {showDocuments ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Dokumente erforderlich – {completeCount} von {enrollments.length}{" "}
          Anmeldungen vollständig
          {course.requiresMedicalCertificate
            ? ` · Attest: ${withAttest.length}/${enrollments.length}`
            : ""}
          .
        </p>
      ) : null}

      {showDocuments ? (
        <DocumentsFilterLinks
          courseId={course.id}
          active={documentsFilter}
          completeCount={completeCount}
          incompleteCount={incompleteCount}
          totalCount={enrollments.length}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {enrollments.length > 0 ? (
          <a
            href={`/api/admin/courses/${course.id}/export`}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            {showDocuments
              ? "Exportieren (Excel + Dateien)"
              : "Excel exportieren"}
          </a>
        ) : null}
        {enrollments.length > 0 && showDocuments ? (
          <a
            href={`/api/admin/courses/${course.id}/dokumente.zip`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Nur Dokumente (ZIP)
          </a>
        ) : null}
      </div>

      {enrollments.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          Noch keine aktiven Anmeldungen für diesen Kurs.
        </p>
      ) : visibleEnrollments.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
          Keine Anmeldungen für diesen Filter.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teilnehmer</TableHead>
                <TableHead className={tableCellTruncate}>Gebucht von</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{t("admin.tablePayment")}</TableHead>
                <TableHead>Bestätigung</TableHead>
                {showDocuments ? (
                  <TableHead className="whitespace-nowrap">
                    Alle Dateien hinterlegt
                  </TableHead>
                ) : null}
                {showDocuments
                  ? documentRequirements.map((requirement) => (
                      <TableHead
                        key={requirement.kind}
                        className="hidden whitespace-nowrap lg:table-cell"
                      >
                        {DOCUMENT_KIND_LABELS[requirement.kind]}
                      </TableHead>
                    ))
                  : null}
                <TableHead>Datum</TableHead>
                <TableHead className={tableHeadActions}>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEnrollments.map((item) => {
                const medical = medicalCertificateDocument(item.documents);
                const docsByKind = new Map(
                  item.documents.map((doc) => [doc.kind, doc]),
                );
                const statusLabel =
                  item.status === "PAID"
                    ? "Bezahlt"
                    : item.status === "WAITLISTED"
                      ? "Warteliste"
                      : medical
                        ? "Attest OK – Zahlung offen"
                        : course.requiresMedicalCertificate
                          ? "Attest ausstehend"
                          : "Zahlung ausstehend";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div>{item.user.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.user.email}
                      </div>
                    </TableCell>
                    <TableCell className={tableCellTruncate}>
                      {item.purchasedBy?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === "PAID" ? "default" : "secondary"
                        }
                      >
                        {statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.status === "WAITLISTED"
                        ? "—"
                        : registrationPaymentLabel(
                            {
                              paymentMethod: item.paymentMethod,
                              creditAppliedCents: item.creditAppliedCents,
                              paidCents: item.paidCents,
                              listPriceCents: course.priceCents,
                              bankTransferApprovedAt:
                                item.bankTransferApprovedAt,
                              stripeSessionId: item.stripeSessionId,
                              settled: item.status === "PAID",
                            },
                            t,
                          ) ?? "—"}
                    </TableCell>
                    <TableCell>
                      {item.status !== "PAID" ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : item.confirmationEmailSentAt ? (
                        <span
                          className="text-sm"
                          title={formatDateTime(item.confirmationEmailSentAt)}
                        >
                          Gesendet{" "}
                          {formatShortDate(item.confirmationEmailSentAt)}
                        </span>
                      ) : (
                        <span className="text-sm text-amber-800">
                          Nicht gesendet
                        </span>
                      )}
                    </TableCell>
                    {showDocuments ? (
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-full text-base font-semibold",
                            item.allDocumentsComplete
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-orange-100 text-orange-700",
                          )}
                          title={
                            item.allDocumentsComplete
                              ? "Alle Dateien hinterlegt"
                              : "Es fehlen noch Dateien"
                          }
                          aria-label={
                            item.allDocumentsComplete
                              ? "Alle Dateien hinterlegt"
                              : "Es fehlen noch Dateien"
                          }
                        >
                          {item.allDocumentsComplete ? "✓" : "!"}
                        </span>
                      </TableCell>
                    ) : null}
                    {showDocuments
                      ? documentRequirements.map((requirement) => {
                          const doc = docsByKind.get(requirement.kind) ?? null;
                          return (
                            <TableCell
                              key={requirement.kind}
                              className="hidden lg:table-cell"
                            >
                              <AdminDocumentPreview
                                courseId={course.id}
                                enrollmentId={item.id}
                                kind={requirement.kind}
                                document={
                                  doc
                                    ? {
                                        id: doc.id,
                                        mimeType: doc.mimeType,
                                        originalName: doc.originalName,
                                      }
                                    : null
                                }
                              />
                            </TableCell>
                          );
                        })
                      : null}
                    <TableCell title={formatDateTime(item.statusChangedAt)}>
                      {formatShortDate(item.statusChangedAt)}
                    </TableCell>
                    <TableCell className={tableCellActions}>
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.status === "PAID" || item.status === "PENDING" ? (
                          <RemoveCourseEnrollmentButton
                            enrollmentId={item.id}
                            memberName={item.user.name}
                            refundCents={
                              item.status === "PAID"
                                ? (item.paidCents ?? course.priceCents)
                                : 0
                            }
                            paymentMethod={item.paymentMethod}
                            paidByCard={
                              item.paymentMethod === "STRIPE" ||
                              (item.paymentMethod !== "BANK_TRANSFER" &&
                                Boolean(item.stripeSessionId))
                            }
                          />
                        ) : null}
                        {item.status === "PAID" ? (
                          <ResendCourseConfirmationButton
                            enrollmentId={item.id}
                            alreadySent={Boolean(item.confirmationEmailSentAt)}
                          />
                        ) : null}
                        {medical ? (
                          <a
                            href={`/api/admin/courses/${course.id}/documents/${item.id}/MEDICAL_CERTIFICATE?download=1`}
                            className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
                          >
                            Attest
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Betrag pro Person: {coursePriceSummary(course)}
      </p>
    </div>
  );
}
