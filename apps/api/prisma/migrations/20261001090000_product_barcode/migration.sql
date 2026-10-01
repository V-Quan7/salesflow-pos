ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;

CREATE UNIQUE INDEX "Product_storeId_barcode_key" ON "Product"("storeId", "barcode");
