import { InventoryTransactionReferenceType, InventoryTransactionType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export function openingStockTransactionData(input: {
  storeId: string;
  productId: string;
  quantity: number;
  actorId: string;
}): Prisma.InventoryTransactionUncheckedCreateInput {
  return {
    id: randomUUID(),
    storeId: input.storeId,
    productId: input.productId,
    type: InventoryTransactionType.ADJUSTMENT,
    quantity: input.quantity,
    beforeQuantity: 0,
    afterQuantity: input.quantity,
    referenceType: InventoryTransactionReferenceType.ADJUSTMENT,
    referenceId: randomUUID(),
    note: 'Opening stock',
    createdBy: input.actorId,
  };
}
