-- Zeitpunkt der letzten Statusänderung einer Kursanmeldung.
ALTER TABLE "Enrollment" ADD COLUMN "statusChangedAt" TIMESTAMP(3);

-- Stornos: Datum der letzten Rückerstattung/Gutschrift, nicht der ursprünglichen Buchung.
UPDATE "Enrollment" AS e
SET "statusChangedAt" = src.at
FROM (
  SELECT "enrollmentId" AS id, MAX("createdAt") AS at
  FROM (
    SELECT "enrollmentId", "createdAt"
    FROM "PendingRefundTransfer"
    WHERE "enrollmentId" IS NOT NULL
    UNION ALL
    SELECT "enrollmentId", "createdAt"
    FROM "CreditTransaction"
    WHERE "enrollmentId" IS NOT NULL
      AND "kind" = 'REFUND'
      AND "description" LIKE 'Stornierung:%'
  ) events
  GROUP BY "enrollmentId"
) AS src
WHERE e.id = src.id
  AND e.status = 'CANCELLED';

UPDATE "Enrollment"
SET "statusChangedAt" = COALESCE("paidAt", "promotedAt", "createdAt")
WHERE "statusChangedAt" IS NULL;

ALTER TABLE "Enrollment" ALTER COLUMN "statusChangedAt" SET NOT NULL;
ALTER TABLE "Enrollment" ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;
