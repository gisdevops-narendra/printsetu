-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_password_enc" TEXT,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
