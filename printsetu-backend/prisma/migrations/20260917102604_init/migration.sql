-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'SHOPKEEPER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'ANALYSIS_FAILED', 'PRINT_ELIGIBLE', 'DELETED');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('CREATED', 'PRINT_ELIGIBLE', 'QUEUED', 'PRINTING', 'PRINTED', 'RETENTION_PENDING', 'DELETED', 'PRINT_FAILED', 'AGENT_OFFLINE', 'PRINT_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaperSize" AS ENUM ('A4', 'A3', 'LETTER', 'LEGAL');

-- CreateEnum
CREATE TYPE "ColorMode" AS ENUM ('BW', 'COLOR');

-- CreateEnum
CREATE TYPE "SideMode" AS ENUM ('SIMPLEX', 'DUPLEX');

-- CreateEnum
CREATE TYPE "QrStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PrinterStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('UPLOAD_RECEIVED', 'PRINT_QUEUED', 'PRINT_COMPLETED', 'PRINT_FAILED');

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "shop_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "role_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "keycloak_user_id" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "page_count" INTEGER,
    "color_pages" INTEGER,
    "color_detection_confidence" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_quotes" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL,
    "colorMode" "ColorMode" NOT NULL,
    "sideMode" "SideMode" NOT NULL,
    "copies" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "billable_pages" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricing_snapshot" JSONB NOT NULL,
    "status_token_claim_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "printer_id" TEXT,
    "quote_id" TEXT,
    "options_json" JSONB NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PrintJobStatus" NOT NULL DEFAULT 'CREATED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "queued_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "status_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_job_events" (
    "id" TEXT NOT NULL,
    "print_job_id" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL,
    "agent_attempt_id" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_settings" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "default_printer_id" TEXT,
    "retention_minutes" INTEGER NOT NULL DEFAULT 30,
    "max_file_size" INTEGER NOT NULL DEFAULT 26214400,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL,
    "colorMode" "ColorMode" NOT NULL,
    "sideMode" "SideMode" NOT NULL,
    "price_per_page" DECIMAL(10,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "public_code" TEXT NOT NULL,
    "target_path" TEXT NOT NULL,
    "status" "QrStatus" NOT NULL DEFAULT 'ACTIVE',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "agent_key_hash" TEXT NOT NULL,
    "printer_name" TEXT NOT NULL,
    "driver_name" TEXT,
    "status" "PrinterStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_heartbeat_at" TIMESTAMP(3),
    "capabilities_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "shop_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "print_job_id" TEXT,
    "event_type" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "destination" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_shop_code_key" ON "shops"("shop_code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_keycloak_user_id_key" ON "users"("keycloak_user_id");

-- CreateIndex
CREATE INDEX "users_shop_id_idx" ON "users"("shop_id");

-- CreateIndex
CREATE INDEX "documents_shop_id_idx" ON "documents"("shop_id");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "print_quotes_status_token_claim_id_key" ON "print_quotes"("status_token_claim_id");

-- CreateIndex
CREATE INDEX "print_quotes_document_id_idx" ON "print_quotes"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_quote_id_key" ON "print_jobs"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_idempotency_key_key" ON "print_jobs"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_status_token_key" ON "print_jobs"("status_token");

-- CreateIndex
CREATE INDEX "print_jobs_shop_id_idx" ON "print_jobs"("shop_id");

-- CreateIndex
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");

-- CreateIndex
CREATE INDEX "print_jobs_document_id_idx" ON "print_jobs"("document_id");

-- CreateIndex
CREATE INDEX "print_job_events_print_job_id_idx" ON "print_job_events"("print_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_settings_shop_id_key" ON "print_settings"("shop_id");

-- CreateIndex
CREATE INDEX "pricing_shop_id_active_idx" ON "pricing"("shop_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_shop_id_paperSize_colorMode_sideMode_effective_from_key" ON "pricing"("shop_id", "paperSize", "colorMode", "sideMode", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_public_code_key" ON "qr_codes"("public_code");

-- CreateIndex
CREATE INDEX "qr_codes_shop_id_idx" ON "qr_codes"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "printers_agent_id_key" ON "printers"("agent_id");

-- CreateIndex
CREATE INDEX "printers_shop_id_idx" ON "printers"("shop_id");

-- CreateIndex
CREATE INDEX "audit_logs_shop_id_idx" ON "audit_logs"("shop_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_shop_id_idx" ON "notifications"("shop_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "print_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_job_events" ADD CONSTRAINT "print_job_events_print_job_id_fkey" FOREIGN KEY ("print_job_id") REFERENCES "print_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_print_job_id_fkey" FOREIGN KEY ("print_job_id") REFERENCES "print_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
