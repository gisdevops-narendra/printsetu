-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL,
    "colorMode" "ColorMode" NOT NULL,
    "sideMode" "SideMode" NOT NULL,
    "min_pages" INTEGER NOT NULL,
    "max_pages" INTEGER,
    "price_per_page" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_tiers_shop_id_active_idx" ON "pricing_tiers"("shop_id", "active");

-- AddForeignKey
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

