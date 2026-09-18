-- Multi-document print requests: a print request ("session") can now
-- carry several documents, each with its own paper/color/side/copies and
-- its own line-item price. Legacy rows (one document per quote/job) are
-- backfilled 1:1 so nothing existing is lost.

-- 1. print_sessions
CREATE TABLE "print_sessions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "print_sessions_shop_id_idx" ON "print_sessions"("shop_id");
ALTER TABLE "print_sessions" ADD CONSTRAINT "print_sessions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. documents.session_id — backfill one session per existing document
-- (each legacy document was already its own single-document request).
ALTER TABLE "documents" ADD COLUMN "session_id" TEXT;

DO $$
DECLARE d RECORD; new_session_id TEXT;
BEGIN
  FOR d IN SELECT id, shop_id FROM documents LOOP
    new_session_id := gen_random_uuid()::text;
    INSERT INTO print_sessions (id, shop_id, created_at) VALUES (new_session_id, d.shop_id, CURRENT_TIMESTAMP);
    UPDATE documents SET session_id = new_session_id WHERE id = d.id;
  END LOOP;
END $$;

ALTER TABLE "documents" ALTER COLUMN "session_id" SET NOT NULL;
CREATE INDEX "documents_session_id_idx" ON "documents"("session_id");
ALTER TABLE "documents" ADD CONSTRAINT "documents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "print_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. print_quote_items — one row per document that was part of a quote.
CREATE TABLE "print_quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL,
    "colorMode" "ColorMode" NOT NULL,
    "sideMode" "SideMode" NOT NULL,
    "copies" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "billable_pages" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "pricing_snapshot" JSONB NOT NULL,

    CONSTRAINT "print_quote_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "print_quote_items_quote_id_idx" ON "print_quote_items"("quote_id");
CREATE INDEX "print_quote_items_document_id_idx" ON "print_quote_items"("document_id");

INSERT INTO "print_quote_items" (id, quote_id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, pricing_snapshot)
SELECT gen_random_uuid()::text, id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, pricing_snapshot
FROM print_quotes;

-- 4. print_quotes — becomes a session-level total; per-document columns
-- move to print_quote_items.
ALTER TABLE "print_quotes" ADD COLUMN "session_id" TEXT;
UPDATE print_quotes q SET session_id = d.session_id FROM documents d WHERE d.id = q.document_id;
ALTER TABLE "print_quotes" ALTER COLUMN "session_id" SET NOT NULL;

ALTER TABLE "print_quotes" DROP CONSTRAINT "print_quotes_document_id_fkey";
DROP INDEX "print_quotes_document_id_idx";
ALTER TABLE "print_quotes" DROP COLUMN "document_id";
ALTER TABLE "print_quotes" DROP COLUMN "paperSize";
ALTER TABLE "print_quotes" DROP COLUMN "colorMode";
ALTER TABLE "print_quotes" DROP COLUMN "sideMode";
ALTER TABLE "print_quotes" DROP COLUMN "copies";
ALTER TABLE "print_quotes" DROP COLUMN "page_count";
ALTER TABLE "print_quotes" DROP COLUMN "billable_pages";
ALTER TABLE "print_quotes" DROP COLUMN "pricing_snapshot";

CREATE INDEX "print_quotes_session_id_idx" ON "print_quotes"("session_id");
ALTER TABLE "print_quotes" ADD CONSTRAINT "print_quotes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "print_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "print_quote_items" ADD CONSTRAINT "print_quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "print_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "print_quote_items" ADD CONSTRAINT "print_quote_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. print_job_items — one row per document that was part of a print job.
CREATE TABLE "print_job_items" (
    "id" TEXT NOT NULL,
    "print_job_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL,
    "colorMode" "ColorMode" NOT NULL,
    "sideMode" "SideMode" NOT NULL,
    "copies" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "billable_pages" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "print_order" INTEGER NOT NULL,

    CONSTRAINT "print_job_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "print_job_items_print_job_id_idx" ON "print_job_items"("print_job_id");
CREATE INDEX "print_job_items_document_id_idx" ON "print_job_items"("document_id");

INSERT INTO "print_job_items" (id, print_job_id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, print_order)
SELECT gen_random_uuid()::text,
       pj.id,
       pj.document_id,
       (pj.options_json->>'paperSize')::"PaperSize",
       (pj.options_json->>'colorMode')::"ColorMode",
       (pj.options_json->>'sideMode')::"SideMode",
       (pj.options_json->>'copies')::int,
       COALESCE(d.page_count, 0),
       COALESCE(d.page_count, 0) * (pj.options_json->>'copies')::int,
       pj.amount,
       0
FROM print_jobs pj
JOIN documents d ON d.id = pj.document_id;

-- 6. print_jobs — drop the old single-document columns.
ALTER TABLE "print_jobs" DROP CONSTRAINT "print_jobs_document_id_fkey";
DROP INDEX "print_jobs_document_id_idx";
ALTER TABLE "print_jobs" DROP COLUMN "document_id";
ALTER TABLE "print_jobs" DROP COLUMN "options_json";

ALTER TABLE "print_job_items" ADD CONSTRAINT "print_job_items_print_job_id_fkey" FOREIGN KEY ("print_job_id") REFERENCES "print_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "print_job_items" ADD CONSTRAINT "print_job_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
