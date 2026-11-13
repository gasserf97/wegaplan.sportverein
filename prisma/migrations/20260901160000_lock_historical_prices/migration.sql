-- Backfill locked purchase prices from existing payment records.
UPDATE "Subscription" AS s
SET "paidCents" = first_payment."amountCents"
FROM (
  SELECT DISTINCT ON ("subscriptionId")
    "subscriptionId",
    "amountCents"
  FROM "SubscriptionPayment"
  ORDER BY "subscriptionId", "paidAt" ASC
) AS first_payment
WHERE s.id = first_payment."subscriptionId"
  AND s."paidCents" IS NULL;

-- Best-effort backfill for paid course enrollments created before paidCents existed.
UPDATE "Enrollment" AS e
SET "paidCents" = c."priceCents"
FROM "Course" AS c
WHERE e."courseId" = c.id
  AND e."status" = 'PAID'
  AND e."paidCents" IS NULL;
