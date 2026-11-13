-- Step 3/3: migrate existing plans to new enum values
UPDATE "SubscriptionPlan" SET "interval" = 'YEARLY_ROLLING' WHERE "interval" = 'YEARLY';
UPDATE "SubscriptionPlan" SET "interval" = 'MONTHLY' WHERE "interval" = 'DAILY';
