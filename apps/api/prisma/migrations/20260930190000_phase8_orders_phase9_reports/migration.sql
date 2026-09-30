ALTER TYPE "InventoryTransactionType" ADD VALUE 'RETURN';

CREATE TYPE "OrderAuditAction" AS ENUM ('CANCEL', 'REFUND');

ALTER TABLE "Order"
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedBy" UUID,
  ADD COLUMN "refundReason" TEXT;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_refundedBy_fkey"
  FOREIGN KEY ("refundedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderAuditEvent" (
  "id" UUID NOT NULL,
  "storeId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" "OrderAuditAction" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderAuditEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");
CREATE INDEX "Order_storeId_orderStatus_createdAt_idx" ON "Order"("storeId", "orderStatus", "createdAt");
CREATE INDEX "Order_storeId_paymentStatus_createdAt_idx" ON "Order"("storeId", "paymentStatus", "createdAt");
CREATE INDEX "Order_storeId_refundedAt_idx" ON "Order"("storeId", "refundedAt");
CREATE INDEX "OrderAuditEvent_storeId_createdAt_idx" ON "OrderAuditEvent"("storeId", "createdAt");
CREATE INDEX "OrderAuditEvent_orderId_createdAt_idx" ON "OrderAuditEvent"("orderId", "createdAt");
CREATE INDEX "OrderAuditEvent_actorId_idx" ON "OrderAuditEvent"("actorId");
CREATE UNIQUE INDEX "OrderAuditEvent_orderId_action_key" ON "OrderAuditEvent"("orderId", "action");
