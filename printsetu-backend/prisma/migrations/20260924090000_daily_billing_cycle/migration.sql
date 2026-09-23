-- Day-wise subscriptions: a DAILY billing cycle alongside MONTHLY and YEARLY.
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'DAILY' BEFORE 'MONTHLY';

-- Existing plans get a daily price of 1/30th of their monthly price,
-- rounded up to the paisa, so 30 days never costs less than one month.
ALTER TABLE "subscription_plans" ADD COLUMN "daily_price" DECIMAL(10,2);
UPDATE "subscription_plans" SET "daily_price" = CEIL("monthly_price" * 100 / 30) / 100;
ALTER TABLE "subscription_plans" ALTER COLUMN "daily_price" SET NOT NULL;
