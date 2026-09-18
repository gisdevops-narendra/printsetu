-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "banner_key" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "logo_key" TEXT,
ADD COLUMN     "opening_hours" JSONB;

-- AlterTable
ALTER TABLE "print_settings" ADD COLUMN     "auto_accept_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_prefs" JSONB;
