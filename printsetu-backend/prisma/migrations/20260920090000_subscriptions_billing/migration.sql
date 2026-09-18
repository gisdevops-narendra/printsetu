-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAYMENT_PENDING', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'FAILED', 'VOID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INITIAL', 'RENEWAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'GATEWAY', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_RENEWAL_REMINDER';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_PAYMENT_FAILED';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_GRACE_REMINDER';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_FINAL_WARNING';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_PAST_DUE';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_SUSPENDED';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_PAID';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_REACTIVATED';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "NotificationEvent" ADD VALUE 'SUBSCRIPTION_TRIAL_ENDING';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "message" TEXT;

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price" DECIMAL(10,2) NOT NULL,
    "yearly_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "max_prints_per_month" INTEGER,
    "max_tokens_per_day" INTEGER,
    "max_printers" INTEGER,
    "priority_support" BOOLEAN NOT NULL DEFAULT false,
    "analytics_access" BOOLEAN NOT NULL DEFAULT false,
    "highlights" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_subscriptions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3),
    "grace_ends_at" TIMESTAMP(3),
    "past_due_since" TIMESTAMP(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "gateway" TEXT NOT NULL DEFAULT 'MANUAL',
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "pending_plan_id" TEXT,
    "pending_cycle" "BillingCycle",
    "automation_paused" BOOLEAN NOT NULL DEFAULT false,
    "paused_until" TIMESTAMP(3),
    "notification_channels" JSONB,
    "reminders_sent" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "plan_name" TEXT NOT NULL,
    "cycle" "BillingCycle" NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'RENEWAL',
    "description" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "payment_method" "PaymentMethod",
    "payment_reference" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_failure" TEXT,
    "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "reason" TEXT,
    "actor_user_id" TEXT,
    "actor_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_subscriptions_shop_id_key" ON "shop_subscriptions"("shop_id");

-- CreateIndex
CREATE INDEX "shop_subscriptions_status_idx" ON "shop_subscriptions"("status");

-- CreateIndex
CREATE INDEX "shop_subscriptions_current_period_end_idx" ON "shop_subscriptions"("current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_shop_id_created_at_idx" ON "invoices"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "refunds_invoice_id_idx" ON "refunds"("invoice_id");

-- CreateIndex
CREATE INDEX "subscription_events_shop_id_created_at_idx" ON "subscription_events"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_events_type_created_at_idx" ON "subscription_events"("type", "created_at");

-- AddForeignKey
ALTER TABLE "shop_subscriptions" ADD CONSTRAINT "shop_subscriptions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_subscriptions" ADD CONSTRAINT "shop_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invoice numbers: INV-YYYYMM-000001 (sequence keeps them unique and ordered).
CREATE SEQUENCE "invoice_number_seq" START 1;

-- Starter plans so the platform is usable immediately; admins can edit or retire them.
INSERT INTO "subscription_plans"
  ("id","name","description","monthly_price","yearly_price","trial_days","max_prints_per_month","max_tokens_per_day","max_printers","priority_support","analytics_access","highlights","sort_order","updated_at")
VALUES
  (gen_random_uuid(),'Basic','For a single-counter shop getting started.',299,2990,7,500,50,1,false,false,ARRAY['QR ordering page','Email reminders'],1,NOW()),
  (gen_random_uuid(),'Standard','For busy shops that need more capacity and insights.',599,5990,14,2000,200,2,false,true,ARRAY['QR ordering page','Email reminders'],2,NOW()),
  (gen_random_uuid(),'Premium','Unlimited printing with priority support.',999,9990,14,NULL,NULL,5,true,true,ARRAY['QR ordering page','Email reminders','Dedicated onboarding'],3,NOW());
