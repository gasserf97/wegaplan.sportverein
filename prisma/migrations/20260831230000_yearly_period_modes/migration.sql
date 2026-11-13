-- Step 1/3: add calendar-year enum value (must commit before use in UPDATE)
ALTER TYPE "SubscriptionInterval" ADD VALUE IF NOT EXISTS 'YEARLY_CALENDAR';
