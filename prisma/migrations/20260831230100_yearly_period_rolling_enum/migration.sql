-- Step 2/3: add rolling-year enum value (separate migration = separate commit)
ALTER TYPE "SubscriptionInterval" ADD VALUE IF NOT EXISTS 'YEARLY_ROLLING';
