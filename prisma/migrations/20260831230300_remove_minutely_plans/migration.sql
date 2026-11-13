-- Retire minutely test interval on existing plans
UPDATE "SubscriptionPlan" SET "interval" = 'MONTHLY' WHERE "interval" = 'MINUTELY';
