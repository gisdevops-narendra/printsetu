-- Pricing is off by default for every shop, including existing ones.
ALTER TABLE "print_settings" ADD COLUMN "pricing_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Quotes and orders made before this change were all priced.
ALTER TABLE "print_quotes" ADD COLUMN "priced" BOOLEAN NOT NULL DEFAULT false;
UPDATE "print_quotes" SET "priced" = true;

ALTER TABLE "print_jobs" ADD COLUMN "priced" BOOLEAN NOT NULL DEFAULT false;
UPDATE "print_jobs" SET "priced" = true;
