import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, InventoryTransactionReferenceType, InventoryTransactionType, OrderAuditAction, OrderStatus, PaymentStatus, Prisma, ProductStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrderReasonDto } from './dto/order-reason.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { storeDateRange } from '../common/store-date';
import { calculateDiscountAmount, type OrderDiscountType } from './order-money';

const maxAttempts = 8;
const maxStock = 2_147_483_647;
const maxMoney = new Prisma.Decimal(`${'9'.repeat(35)}.${'9'.repeat(30)}`);
class StockChangedError extends Error {}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListOrdersDto) {
    if ((query.dateFrom && !query.dateTo) || (!query.dateFrom && query.dateTo)) {
      throw new BadRequestException('dateFrom and dateTo must be supplied together');
    }
    const dateRange = storeDateRange(query.dateFrom, query.dateTo, actor.store.timezone);
    const search = query.search?.trim();
    const where: Prisma.OrderWhereInput = {
      storeId: actor.storeId,
      ...(query.status ? { orderStatus: query.status as OrderStatus } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as PaymentStatus } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET' } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(search ? { OR: [
        { orderCode: { contains: search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { customer: { is: { phone: { contains: search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ [query.sort]: query.order }, { id: query.order }],
        select: { id: true, orderCode: true, subtotal: true, discount: true, total: true, paymentMethod: true,
          paymentStatus: true, orderStatus: true, createdAt: true, updatedAt: true,
          customer: { select: { id: true, name: true, phone: true } },
          staff: { select: { id: true, name: true } } } }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async get(actor: AuthenticatedUser, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, storeId: actor.storeId }, select: {
      id: true, orderCode: true, subtotal: true, discount: true, discountType: true, discountValue: true, total: true,
      paymentMethod: true, paymentStatus: true, orderStatus: true, createdAt: true, updatedAt: true,
      amountReceived: true, changeAmount: true,
      refundedAt: true, refundReason: true,
      customer: { select: { id: true, name: true, phone: true } },
      staff: { select: { id: true, name: true } },
      store: { select: { name: true, logoUrl: true, address: true, phone: true, currency: true, timezone: true, locale: true } },
      items: { select: { id: true, productNameSnapshot: true, skuSnapshot: true, quantity: true, unitPrice: true, discount: true, total: true } },
      auditEvents: { orderBy: { createdAt: 'asc' }, select: { action: true, reason: true, createdAt: true, actor: { select: { id: true, name: true } } } },
    } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async cancel(actor: AuthenticatedUser, id: string, dto: OrderReasonDto) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Reason is required');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({ where: { id, storeId: actor.storeId }, select: { id: true, orderStatus: true, paymentStatus: true } });
        if (!order) throw new NotFoundException('Order not found');
        if (order.orderStatus !== OrderStatus.PENDING) throw new ConflictException('Only pending orders can be cancelled');
        const changed = await tx.order.updateMany({ where: { id, storeId: actor.storeId, orderStatus: OrderStatus.PENDING }, data: { orderStatus: OrderStatus.CANCELLED } });
        if (changed.count !== 1) throw new ConflictException('Order state changed; reload and retry');
        await tx.orderAuditEvent.create({ data: { storeId: actor.storeId, orderId: id, actorId: actor.id, action: OrderAuditAction.CANCEL, reason } });
        return { id, orderStatus: OrderStatus.CANCELLED, paymentStatus: order.paymentStatus };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isSerializationError(error)) throw new ConflictException('Order state changed; reload and retry');
      throw error;
    }
  }

  async refund(actor: AuthenticatedUser, id: string, dto: OrderReasonDto) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Reason is required');
    const refundedAt = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({ where: { id, storeId: actor.storeId }, select: {
          id: true, orderStatus: true, paymentStatus: true,
          items: { select: { productId: true, quantity: true } },
        } });
        if (!order) throw new NotFoundException('Order not found');
        if (order.orderStatus !== OrderStatus.COMPLETED || order.paymentStatus !== PaymentStatus.PAID) {
          throw new ConflictException('Only completed and paid orders can be refunded');
        }
        const changed = await tx.order.updateMany({ where: {
          id, storeId: actor.storeId, orderStatus: OrderStatus.COMPLETED, paymentStatus: PaymentStatus.PAID,
        }, data: { orderStatus: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.REFUNDED,
          refundedAt, refundedBy: actor.id, refundReason: reason } });
        if (changed.count !== 1) throw new ConflictException('Order state changed; reload and retry');

        const quantities = new Map<string, number>();
        for (const item of order.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
        for (const productId of [...quantities.keys()].sort()) {
          const quantity = quantities.get(productId)!;
          const product = await tx.product.findFirst({ where: { id: productId, storeId: actor.storeId }, select: { id: true, stockQuantity: true } });
          if (!product) throw new ConflictException('A referenced product is unavailable for inventory return');
          const afterQuantity = product.stockQuantity + quantity;
          if (!Number.isSafeInteger(afterQuantity) || afterQuantity > maxStock) throw new ConflictException('Inventory return exceeds the supported stock range');
          const updated = await tx.product.updateMany({ where: { id: product.id, storeId: actor.storeId, stockQuantity: product.stockQuantity }, data: { stockQuantity: { increment: quantity } } });
          if (updated.count !== 1) throw new StockChangedError();
          await tx.inventoryTransaction.create({ data: {
            storeId: actor.storeId, productId, type: InventoryTransactionType.RETURN, quantity,
            beforeQuantity: product.stockQuantity, afterQuantity, referenceType: InventoryTransactionReferenceType.ORDER,
            referenceId: id, note: `Refund: ${reason}`, createdBy: actor.id,
          } });
        }
        await tx.orderAuditEvent.create({ data: { storeId: actor.storeId, orderId: id, actorId: actor.id, action: OrderAuditAction.REFUND, reason } });
        return { id, orderStatus: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.REFUNDED, refundedAt };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (error instanceof StockChangedError || this.isSerializationError(error)) throw new ConflictException('Order or stock changed concurrently; reload and retry');
      throw error;
    }
  }

  async updateStatus(actor: AuthenticatedUser, id: string, dto: UpdateOrderStatusDto) {
    if (dto.status === OrderStatus.CANCELLED) {
      if (!actor.permissions.includes('orders:cancel')) throw new ForbiddenException();
      return this.cancel(actor, id, { reason: dto.reason ?? '' });
    }
    if (dto.status === OrderStatus.REFUNDED) {
      if (!actor.permissions.includes('orders:refund')) throw new ForbiddenException();
      return this.refund(actor, id, { reason: dto.reason ?? '' });
    }
    throw new ConflictException('Order completion is only available through its business workflow');
  }

  async create(actor: AuthenticatedUser, dto: CreateOrderDto) {
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > maxStock) throw new BadRequestException('Product quantity exceeds the supported range');
      quantities.set(item.productId, quantity);
    }
    const hasLegacyDiscount = dto.discount !== undefined;
    const hasDiscountType = dto.discountType !== undefined;
    const hasDiscountValue = dto.discountValue !== undefined;
    if (hasLegacyDiscount && (hasDiscountType || hasDiscountValue)) {
      throw new BadRequestException('Use either legacy discount or discountType/discountValue, not both');
    }
    if (hasDiscountType !== hasDiscountValue) {
      throw new BadRequestException('discountType and discountValue must be supplied together');
    }
    const discountType: OrderDiscountType = dto.discountType ?? 'FIXED';
    const discountValue = new Prisma.Decimal(dto.discountValue ?? dto.discount ?? '0');
    if (discountValue.isNegative()) throw new BadRequestException('Discount cannot be negative');
    if (discountType === 'PERCENTAGE' && discountValue.greaterThan(100)) {
      throw new BadRequestException('Percentage discount cannot exceed 100');
    }
    const isCash = dto.paymentMethod === 'CASH';
    const hasAmountReceived = dto.amountReceived !== undefined && dto.amountReceived !== null;
    if (!isCash && hasAmountReceived) throw new BadRequestException('amountReceived is only valid for cash payments');
    if (!isCash && dto.manualPaymentConfirmed !== true) {
      throw new BadRequestException('Staff must manually confirm the non-cash payment before checkout');
    }
    if (isCash && dto.manualPaymentConfirmed === true) {
      throw new BadRequestException('Manual non-cash confirmation is not valid for cash payments');
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const store = await tx.store.findUnique({ where: { id: actor.storeId }, select: { currency: true } });
          if (!store) throw new NotFoundException('Store not found');
          if (dto.customerId) {
            const customer = await tx.customer.findFirst({ where: { id: dto.customerId, storeId: actor.storeId }, select: { id: true, status: true } });
            if (!customer) throw new NotFoundException('Customer not found');
            if (customer.status !== CustomerStatus.ACTIVE) throw new BadRequestException('Inactive customers cannot be used for new orders');
          }

          const productIds = [...quantities.keys()].sort();
          const products = await tx.product.findMany({ where: { id: { in: productIds }, storeId: actor.storeId },
            select: { id: true, sku: true, name: true, sellingPrice: true, stockQuantity: true, status: true, unit: true, imageUrl: true,
              category: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } });
          if (products.length !== productIds.length) throw new NotFoundException('One or more products are unavailable');
          if (products.some((product) => product.status !== ProductStatus.ACTIVE)) throw new ConflictException('Inactive products cannot be sold');
          for (const product of products) {
            if (product.stockQuantity < quantities.get(product.id)!) throw new ConflictException(`Insufficient stock for ${product.sku}`);
          }

          const productById = new Map(products.map((product) => [product.id, product]));
          const lineTotals = new Map<string, Prisma.Decimal>();
          let subtotal = new Prisma.Decimal(0);
          for (const id of productIds) {
            const product = productById.get(id)!;
            const line = product.sellingPrice.mul(quantities.get(id)!);
            lineTotals.set(id, line);
            subtotal = subtotal.add(line);
          }
          if (subtotal.greaterThan(maxMoney)) throw new BadRequestException('Order amount exceeds the supported range');
          const discount = calculateDiscountAmount(subtotal, discountType, discountValue, store.currency);
          if (discount.isNegative() || discount.greaterThan(subtotal)) throw new BadRequestException('Discount cannot exceed subtotal');
          const total = subtotal.sub(discount);
          if (total.isNegative()) throw new BadRequestException('Order total cannot be negative');
          let amountReceived: Prisma.Decimal | null = null;
          let changeAmount: Prisma.Decimal | null = null;
          if (isCash && hasAmountReceived) {
            amountReceived = new Prisma.Decimal(dto.amountReceived!);
            if (amountReceived.isNegative() || amountReceived.greaterThan(maxMoney)) {
              throw new BadRequestException('Cash amount is outside the supported range');
            }
            if (amountReceived.lessThan(total)) throw new BadRequestException('Cash received is less than the order total');
            changeAmount = amountReceived.sub(total);
          }
          const orderId = randomUUID();
          const order = await tx.order.create({ data: {
            id: orderId, storeId: actor.storeId, orderCode: `ORD-${randomUUID().toUpperCase()}`,
            customerId: dto.customerId ?? null, staffId: actor.id, subtotal, discount,
            discountType, discountValue, total, amountReceived, changeAmount,
            paymentMethod: dto.paymentMethod, paymentStatus: PaymentStatus.PAID, orderStatus: OrderStatus.COMPLETED,
            items: { create: productIds.map((id) => {
              const product = productById.get(id)!;
              return { productId: id, productNameSnapshot: product.name, skuSnapshot: product.sku,
                quantity: quantities.get(id)!, unitPrice: product.sellingPrice, discount: new Prisma.Decimal(0), total: lineTotals.get(id)! };
            }) },
          }, select: {
            id: true, orderCode: true, subtotal: true, discount: true, discountType: true, discountValue: true, total: true,
            amountReceived: true, changeAmount: true, paymentMethod: true,
            paymentStatus: true, orderStatus: true, createdAt: true,
            customer: { select: { id: true, name: true, phone: true } },
            staff: { select: { id: true, name: true } },
            store: { select: { name: true, logoUrl: true, address: true, phone: true, currency: true, timezone: true, locale: true } },
            items: { select: { id: true, productNameSnapshot: true, skuSnapshot: true, quantity: true, unitPrice: true, discount: true, total: true } },
          } });

          for (const id of productIds) {
            const product = productById.get(id)!;
            const quantity = quantities.get(id)!;
            const beforeQuantity = product.stockQuantity;
            const afterQuantity = beforeQuantity - quantity;
            const changed = await tx.product.updateMany({
              where: { id, storeId: actor.storeId, status: ProductStatus.ACTIVE, stockQuantity: beforeQuantity, sellingPrice: product.sellingPrice },
              data: { stockQuantity: { decrement: quantity } },
            });
            if (changed.count !== 1) throw new StockChangedError();
            await tx.inventoryTransaction.create({ data: {
              storeId: actor.storeId, productId: id, type: InventoryTransactionType.SALE, quantity: -quantity,
              beforeQuantity, afterQuantity, referenceType: InventoryTransactionReferenceType.ORDER,
              referenceId: order.id, createdBy: actor.id,
            } });
          }
          return order;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
      } catch (error) {
        if (error instanceof StockChangedError || this.isSerializationError(error)) {
          if (attempt + 1 < maxAttempts) continue;
          throw new ConflictException('Stock changed concurrently; retry checkout');
        }
        throw error;
      }
    }
    throw new ConflictException('Stock changed concurrently; retry checkout');
  }

  private isSerializationError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
  }
}
