-- Daily Online/Offline scheduler on the shop's opening hours.
ALTER TABLE "print_settings" ADD COLUMN "auto_schedule" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "print_settings" ADD COLUMN "schedule_override" BOOLEAN;
ALTER TABLE "print_settings" ADD COLUMN "schedule_override_until" TIMESTAMP(3);
