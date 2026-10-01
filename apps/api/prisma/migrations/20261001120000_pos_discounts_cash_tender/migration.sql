CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

ALTER TABLE "Order"
ADD COLUMN "discountType" "DiscountType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN "discountValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "amountReceived" DECIMAL(65,30),
ADD COLUMN "changeAmount" DECIMAL(65,30);

UPDATE "Order"
SET "discountValue" = "discount";
