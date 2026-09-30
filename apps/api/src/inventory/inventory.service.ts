import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionReferenceType, InventoryTransactionType, Prisma, ProductStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryHistoryDto } from './dto/list-inventory-history.dto';
import { ListInventoryDto } from './dto/list-inventory.dto';

const historyInclude = { creator: { select: { id: true, name: true } } } as const;
const maxStock = 2_147_483_647;
const maxAdjustmentAttempts = 8;

class ConcurrentStockUpdateError extends Error {}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListInventoryDto) {
    const where: Prisma.ProductWhereInput = {
      storeId: actor.storeId,
      ...(query.status ? { status: query.status as ProductStatus } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { sku: { contains: query.search.trim(), mode: 'insensitive' } },
      ] } : {}),
    };

    if (query.lowStock === true) {
      where.status = ProductStatus.ACTIVE;
      where.stockQuantity = { lte: this.prisma.product.fields.minStock };
    } else if (query.lowStock === false) {
      where.NOT = {
        status: ProductStatus.ACTIVE,
        stockQuantity: { lte: this.prisma.product.fields.minStock },
      };
    }

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [query.sortBy]: query.order },
        select: {
          id: true, sku: true, name: true, categoryId: true, unit: true, stockQuantity: true,
          minStock: true, status: true, updatedAt: true,
          category: { select: { id: true, name: true, slug: true, status: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: products.map((product) => ({
        ...product,
        lowStock: product.status === ProductStatus.ACTIVE && product.stockQuantity <= product.minStock,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async adjust(actor: AuthenticatedUser, dto: AdjustInventoryDto) {
    const referenceId = randomUUID();
    const note = dto.note?.trim() || null;

    for (let attempt = 0; attempt < maxAdjustmentAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const product = await transaction.product.findFirst({
            where: { id: dto.productId, storeId: actor.storeId },
            select: { id: true, stockQuantity: true },
          });
          if (!product) throw new NotFoundException('Product not found');

          const beforeQuantity = product.stockQuantity;
          const afterQuantity = beforeQuantity + dto.quantity;
          if (afterQuantity < 0) throw new ConflictException('Adjustment cannot make stock negative');
          if (afterQuantity > maxStock) throw new ConflictException('Adjustment exceeds the supported stock range');

          const updated = await transaction.product.updateMany({
            where: { id: product.id, storeId: actor.storeId, stockQuantity: beforeQuantity },
            data: { stockQuantity: { increment: dto.quantity } },
          });
          if (updated.count !== 1) throw new ConcurrentStockUpdateError();

          const inventoryTransaction = await transaction.inventoryTransaction.create({
            data: {
              storeId: actor.storeId,
              productId: product.id,
              type: InventoryTransactionType.ADJUSTMENT,
              quantity: dto.quantity,
              beforeQuantity,
              afterQuantity,
              referenceType: InventoryTransactionReferenceType.ADJUSTMENT,
              referenceId,
              note,
              createdBy: actor.id,
            },
            include: historyInclude,
          });

          return { productId: product.id, stockQuantity: afterQuantity, transaction: inventoryTransaction };
        });
      } catch (error) {
        if (error instanceof ConcurrentStockUpdateError || this.isSerializationError(error)) {
          if (attempt + 1 < maxAdjustmentAttempts) continue;
          throw new ConflictException('Stock changed concurrently; retry the adjustment');
        }
        throw error;
      }
    }

    throw new ConflictException('Stock changed concurrently; retry the adjustment');
  }

  async history(actor: AuthenticatedUser, productId: string, query: ListInventoryHistoryDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId: actor.storeId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const where: Prisma.InventoryTransactionWhereInput = { productId, storeId: actor.storeId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryTransaction.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: query.order }, { id: query.order }],
        include: historyInclude,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  private isSerializationError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
  }
}
