-- Max Berger had two Vereinsmitgliedschaften: the real purchase (e.g. 0,50 €,
-- gültig bis 1. September) and the seeded row demo-sub-max-member with a
-- hardcoded 15. März 2026–2027 period. /konto listed the expired purchase;
-- /abos/[id] showed the still-valid seed row as "Ihr aktives Abo".

DELETE FROM "SubscriptionPayment"
WHERE "subscriptionId" = 'demo-sub-max-member'
  AND EXISTS (
    SELECT 1
    FROM "Subscription" AS demo
    JOIN "Subscription" AS other
      ON other."userId" = demo."userId"
     AND other."planId" = demo."planId"
     AND other.id <> demo.id
    WHERE demo.id = 'demo-sub-max-member'
  );

DELETE FROM "Subscription"
WHERE id = 'demo-sub-max-member'
  AND EXISTS (
    SELECT 1
    FROM "Subscription" AS other
    WHERE other."userId" = "Subscription"."userId"
      AND other."planId" = "Subscription"."planId"
      AND other.id <> 'demo-sub-max-member'
  );
