"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { EnrollmentDocumentKind } from "@/generated/prisma/client";
import { prepareCourseEnrollmentsAction } from "@/app/actions/course-enrollment";
import { startCheckoutAction } from "@/app/actions/checkout";
import { rememberCoursePendingCheckout } from "@/components/court-checkout-cleanup";
import { FamilyPurchase, type FamilyBuyer } from "@/components/family-purchase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/locale-provider";
import type { CheckoutPaymentChoice } from "@/lib/bank-transfer";
import {
  DOCUMENT_KIND_LABELS,
  type DocumentRequirement,
} from "@/lib/course-documents";
import { formatEuro } from "@/lib/format";

type PreparedEnrollment = {
  enrollmentId: string;
  userId: string;
  userName: string;
  priceCents: number;
  uploadedKinds: EnrollmentDocumentKind[];
};

const FILE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

async function uploadEnrollmentDocument(
  enrollmentId: string,
  kind: EnrollmentDocumentKind,
  file: File,
): Promise<{ ok: true; kind: EnrollmentDocumentKind } | { error: string }> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("kind", kind);
  const response = await fetch(`/api/enrollments/${enrollmentId}/documents`, {
    method: "POST",
    body: formData,
  });
  const result = (await response.json()) as
    | { ok: true; fileName: string; kind: EnrollmentDocumentKind }
    | { error: string };
  if (!response.ok || "error" in result) {
    return {
      error: "error" in result ? result.error : "Upload fehlgeschlagen.",
    };
  }
  return { ok: true, kind: result.kind };
}

export function CourseRegistrationPanel({
  courseId,
  people,
  requireMembership = true,
  requiresAttest,
  mandatoryDocumentKinds = [],
  stripeAvailable,
  bankTransferAvailable,
  creditBalanceCents = 0,
}: {
  courseId: string;
  people: FamilyBuyer[];
  requireMembership?: boolean;
  requiresAttest: boolean;
  mandatoryDocumentKinds?: EnrollmentDocumentKind[];
  stripeAvailable: boolean;
  bankTransferAvailable: boolean;
  creditBalanceCents?: number;
}) {
  const { t } = useI18n();
  const hasPaidSelectablePerson = people.some(
    (person) =>
      !person.alreadyHas &&
      !person.ineligibleReason &&
      (!requireMembership || person.hasMembership) &&
      person.priceCents > 0,
  );

  const documentRequirements: DocumentRequirement[] = [
    ...mandatoryDocumentKinds.map((kind) => ({ kind, mandatory: true })),
    ...(requiresAttest
      ? ([{ kind: "MEDICAL_CERTIFICATE" as const, mandatory: false }] satisfies DocumentRequirement[])
      : []),
  ];

  if (documentRequirements.length > 0) {
    return (
      <DocumentsCourseRegistration
        courseId={courseId}
        people={people}
        requireMembership={requireMembership}
        requirements={documentRequirements}
        stripeAvailable={stripeAvailable}
        bankTransferAvailable={bankTransferAvailable}
      />
    );
  }

  return (
    <FamilyPurchase
      kind="course"
      itemId={courseId}
      people={people}
      requireMembership={requireMembership}
      stripeAvailable={stripeAvailable}
      bankTransferAvailable={bankTransferAvailable}
      creditBalanceCents={creditBalanceCents}
      submitLabel={
        hasPaidSelectablePerson ? t("common.payNow") : t("common.enrollFree")
      }
    />
  );
}

function DocumentsCourseRegistration({
  courseId,
  people,
  requireMembership,
  requirements,
  stripeAvailable,
  bankTransferAvailable,
}: {
  courseId: string;
  people: FamilyBuyer[];
  requireMembership: boolean;
  requirements: DocumentRequirement[];
  stripeAvailable: boolean;
  bankTransferAvailable: boolean;
}) {
  const { t } = useI18n();
  const mandatoryKinds = requirements
    .filter((item) => item.mandatory)
    .map((item) => item.kind);
  const hasOptionalAttest = requirements.some(
    (item) => item.kind === "MEDICAL_CERTIFICATE" && !item.mandatory,
  );
  const selectable = people.filter((person) => {
    if (person.alreadyHas) return false;
    if (person.ineligibleReason) return false;
    if (requireMembership && !person.hasMembership) return false;
    return true;
  });
  const defaultIds = selectable.map((person) => person.id);
  const [selected, setSelected] = useState<string[]>(defaultIds);
  const [step, setStep] = useState<"select" | "documents" | "pay">("select");
  const [enrollments, setEnrollments] = useState<PreparedEnrollment[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentChoice>(
    stripeAvailable ? "stripe" : "bank_transfer",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  function inputKey(enrollmentId: string, kind: EnrollmentDocumentKind) {
    return `${enrollmentId}:${kind}`;
  }

  const allMandatoryReady =
    enrollments.length > 0 &&
    (mandatoryKinds.length === 0 ||
      enrollments.every((item) =>
        mandatoryKinds.every((kind) => item.uploadedKinds.includes(kind)),
      ));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function markUploaded(enrollmentId: string, kind: EnrollmentDocumentKind) {
    setEnrollments((current) =>
      current.map((row) =>
        row.enrollmentId === enrollmentId
          ? {
              ...row,
              uploadedKinds: [...new Set([...row.uploadedKinds, kind])],
            }
          : row,
      ),
    );
  }

  async function uploadOne(
    enrollmentId: string,
    kind: EnrollmentDocumentKind,
    file: File,
  ) {
    const result = await uploadEnrollmentDocument(enrollmentId, kind, file);
    if ("error" in result) {
      throw new Error(
        `${DOCUMENT_KIND_LABELS[kind]}: ${result.error}`,
      );
    }
    markUploaded(enrollmentId, result.kind);
  }

  async function uploadSelectedForEnrollment(enrollment: PreparedEnrollment) {
    const pendingUploads = requirements
      .filter((requirement) => !enrollment.uploadedKinds.includes(requirement.kind))
      .map((requirement) => {
        const input = fileInputRefs.current.get(
          inputKey(enrollment.enrollmentId, requirement.kind),
        );
        const file = input?.files?.[0] ?? null;
        return file
          ? { kind: requirement.kind, file, input }
          : null;
      })
      .filter((item): item is { kind: EnrollmentDocumentKind; file: File; input: HTMLInputElement | null } =>
        Boolean(item),
      );

    if (pendingUploads.length === 0) {
      setError(
        "Bitte zuerst Dateien auswählen, die hochgeladen werden sollen.",
      );
      return;
    }

    for (const item of pendingUploads) {
      await uploadOne(enrollment.enrollmentId, item.kind, item.file);
      if (item.input) item.input.value = "";
    }
  }

  async function uploadAllSelected() {
    let uploadedAny = false;
    for (const enrollment of enrollments) {
      const pendingUploads = requirements
        .filter(
          (requirement) =>
            !enrollment.uploadedKinds.includes(requirement.kind),
        )
        .map((requirement) => {
          const input = fileInputRefs.current.get(
            inputKey(enrollment.enrollmentId, requirement.kind),
          );
          const file = input?.files?.[0] ?? null;
          return file
            ? { kind: requirement.kind, file, input }
            : null;
        })
        .filter(
          (
            item,
          ): item is {
            kind: EnrollmentDocumentKind;
            file: File;
            input: HTMLInputElement | null;
          } => Boolean(item),
        );

      for (const item of pendingUploads) {
        uploadedAny = true;
        await uploadOne(enrollment.enrollmentId, item.kind, item.file);
        if (item.input) item.input.value = "";
      }
    }
    if (!uploadedAny) {
      setError(
        "Bitte zuerst Dateien auswählen, die hochgeladen werden sollen.",
      );
    }
  }

  const totalLabel = useMemo(() => {
    return people
      .filter((person) => selected.includes(person.id))
      .reduce((sum, person) => sum + person.priceCents, 0);
  }, [people, selected]);
  const enrollmentTotal = useMemo(
    () => enrollments.reduce((sum, item) => sum + item.priceCents, 0),
    [enrollments],
  );

  if (step === "pay" && allMandatoryReady) {
    return (
      <div className="grid gap-4">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {mandatoryKinds.length > 0
            ? "Pflicht-Dokumente vollständig. Bitte schließen Sie die Zahlung ab."
            : "Bitte schließen Sie die Zahlung ab."}
        </p>
        {enrollmentTotal > 0 ? (
          <p className="text-sm">
            {t("courses.priceSummary", {
              total: formatEuro(enrollmentTotal),
              credit: "",
              due: formatEuro(enrollmentTotal),
            })}
          </p>
        ) : null}
        {enrollmentTotal > 0 && (stripeAvailable || bankTransferAvailable) ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              {t("common.paymentMethod")}
            </legend>
            {stripeAvailable ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  checked={paymentMethod === "stripe"}
                  onChange={() => setPaymentMethod("stripe")}
                  className="mt-1 size-4 accent-primary"
                />
                <span>{t("common.stripe")}</span>
              </label>
            ) : null}
            {bankTransferAvailable ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  checked={paymentMethod === "bank_transfer"}
                  onChange={() => setPaymentMethod("bank_transfer")}
                  className="mt-1 size-4 accent-primary"
                />
                <span>{t("common.bankTransfer")}</span>
              </label>
            ) : null}
          </fieldset>
        ) : null}
        <Button
          type="button"
          size="lg"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await startCheckoutAction(
                courseId,
                enrollments.map((item) => item.userId),
                paymentMethod,
                false,
              );
              if (result && "error" in result && result.error) {
                setError(result.error);
                return;
              }
              if (result && "url" in result) {
                if (paymentMethod !== "bank_transfer") {
                  rememberCoursePendingCheckout(courseId);
                }
                window.location.assign(result.url);
              }
            });
          }}
        >
          {pending
            ? t("common.redirecting")
            : enrollmentTotal === 0
              ? t("common.completeRegistration")
              : t("common.payNow")}
        </Button>
        <button
          type="button"
          className="justify-self-start text-xs underline"
          onClick={() => setStep("documents")}
        >
          Dokumente bearbeiten
        </button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (step === "documents") {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Bitte laden Sie die erforderlichen Dateien hoch (PDF, JPG oder PNG,
          max. 10 MB).
          {hasOptionalAttest
            ? " Das ärztliche Attest können Sie jetzt mit hochladen oder später unter „Mein Konto“ nachreichen."
            : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={uploadPending}
            onClick={() => {
              setError(null);
              startUpload(async () => {
                try {
                  await uploadAllSelected();
                } catch (uploadError) {
                  setError(
                    uploadError instanceof Error
                      ? uploadError.message
                      : t("errors.courses.uploadFailed"),
                  );
                }
              });
            }}
          >
            {uploadPending ? t("courses.uploading") : "Alle hochladen"}
          </Button>
        </div>
        <ul className="grid gap-4">
          {enrollments.map((item) => {
            const missingForPerson = requirements.filter(
              (requirement) => !item.uploadedKinds.includes(requirement.kind),
            );
            return (
              <li
                key={item.enrollmentId}
                className="rounded-lg border border-border px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{item.userName}</p>
                  {missingForPerson.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploadPending}
                      onClick={() => {
                        setError(null);
                        startUpload(async () => {
                          try {
                            await uploadSelectedForEnrollment(item);
                          } catch (uploadError) {
                            setError(
                              uploadError instanceof Error
                                ? uploadError.message
                                : t("errors.courses.uploadFailed"),
                            );
                          }
                        });
                      }}
                    >
                      {uploadPending
                        ? t("courses.uploading")
                        : "Alle hochladen"}
                    </Button>
                  ) : (
                    <span className="text-xs font-medium text-emerald-700">
                      Alle Dateien hochgeladen
                    </span>
                  )}
                </div>
                <ul className="mt-3 grid gap-3">
                  {requirements.map((requirement) => {
                    const uploaded = item.uploadedKinds.includes(
                      requirement.kind,
                    );
                    return (
                      <li key={requirement.kind} className="grid gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {DOCUMENT_KIND_LABELS[requirement.kind]}
                          {requirement.mandatory ? " · Pflicht" : " · optional"}
                          {uploaded ? " · hochgeladen" : " · fehlt"}
                        </p>
                        {uploaded ? null : (
                          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                            <Input
                              type="file"
                              accept={FILE_ACCEPT}
                              ref={(node) => {
                                fileInputRefs.current.set(
                                  inputKey(item.enrollmentId, requirement.kind),
                                  node,
                                );
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={uploadPending}
                              onClick={() => {
                                const input = fileInputRefs.current.get(
                                  inputKey(
                                    item.enrollmentId,
                                    requirement.kind,
                                  ),
                                );
                                const file = input?.files?.[0];
                                if (!file) {
                                  setError(
                                    `Bitte eine Datei für ${DOCUMENT_KIND_LABELS[requirement.kind]} auswählen.`,
                                  );
                                  return;
                                }
                                setError(null);
                                startUpload(async () => {
                                  try {
                                    await uploadOne(
                                      item.enrollmentId,
                                      requirement.kind,
                                      file,
                                    );
                                    if (input) input.value = "";
                                  } catch (uploadError) {
                                    setError(
                                      uploadError instanceof Error
                                        ? uploadError.message
                                        : t("errors.courses.uploadFailed"),
                                    );
                                  }
                                });
                              }}
                            >
                              {uploadPending
                                ? t("courses.uploading")
                                : "Hochladen"}
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!allMandatoryReady || pending}
            onClick={() => {
              setError(null);
              if (enrollmentTotal === 0) {
                start(async () => {
                  const result = await startCheckoutAction(
                    courseId,
                    enrollments.map((row) => row.userId),
                  );
                  if (result && "error" in result && result.error) {
                    setError(result.error);
                    return;
                  }
                  if (result && "url" in result) {
                    window.location.assign(result.url);
                  }
                });
                return;
              }
              setStep("pay");
            }}
          >
            {enrollmentTotal === 0
              ? t("common.completeRegistration")
              : t("common.continuePayment")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("select")}
          >
            {t("common.back")}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {mandatoryKinds.length > 0
          ? `Für diesen Kurs sind Pflicht-Dokumente erforderlich: ${mandatoryKinds
              .map((kind) => DOCUMENT_KIND_LABELS[kind])
              .join(", ")}.`
          : "Für diesen Kurs kann ein ärztliches Attest hochgeladen werden."}
        {hasOptionalAttest && mandatoryKinds.length > 0
          ? " Das Attest ist optional und kann jetzt oder später nachgereicht werden."
          : null}
      </p>
      <ul className="grid gap-2">
        {people.map((person) => {
          const blocked =
            person.alreadyHas ||
            Boolean(person.ineligibleReason) ||
            (requireMembership && !person.hasMembership);
          return (
            <li key={person.id}>
              <label
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  blocked
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={selected.includes(person.id)}
                  disabled={blocked}
                  onChange={() => toggle(person.id)}
                />
                <span className="font-medium">
                  {person.name}
                  {person.isSelf ? ` ${t("common.you")}` : ""}
                  {" · "}
                  {person.priceCents === 0
                    ? t("common.free")
                    : formatEuro(person.priceCents)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        Zwischensumme: {formatEuro(totalLabel)}
      </p>
      <Button
        type="button"
        size="lg"
        disabled={pending || selected.length === 0}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await prepareCourseEnrollmentsAction(
              courseId,
              selected,
            );
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            if (result && "enrollments" in result) {
              setEnrollments(
                result.enrollments.map((row) => ({
                  enrollmentId: row.enrollmentId,
                  userId: row.userId,
                  userName: row.userName,
                  priceCents: row.priceCents,
                  uploadedKinds: row.uploadedKinds ?? [],
                })),
              );
              setStep("documents");
            }
          });
        }}
      >
        {pending ? t("courses.preparing") : "Weiter zu den Dokumenten"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
