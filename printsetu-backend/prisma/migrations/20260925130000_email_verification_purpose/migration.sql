-- AlterTable
ALTER TABLE "email_verifications" DROP CONSTRAINT "email_verifications_pkey",
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'REGISTRATION',
ADD CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("purpose", "email");

