-- AlterTable
ALTER TABLE "print_jobs" ADD COLUMN     "token_number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_token_number_key" ON "print_jobs"("token_number");
