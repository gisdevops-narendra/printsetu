-- AlterTable
ALTER TABLE "print_job_items" ADD COLUMN     "edit_state" JSONB,
ADD COLUMN     "rendered_at" TIMESTAMP(3),
ADD COLUMN     "rendered_s3_key" TEXT;
