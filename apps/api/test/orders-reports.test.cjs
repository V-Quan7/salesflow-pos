const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { Prisma, OrderStatus, PaymentStatus } = require('@prisma/client');
const { OrdersService } = require('../dist/orders/orders.service');
const { ReportsService } = require('../dist/reports/reports.service');
const { storeDateRange, storeMidnightUtc } = require('../dist/common/store-date');

const actor = { id: '10000000-0000-4000-8000-000000000001', storeId: '20000000-0000-4000-8000-000000000001',
  store: { id: '20000000-0000-4000-8000-000000000001', code: 'test', name: 'Test', timezone: 'Asia/Ho_Chi_Minh' },
  permissions: ['orders:cancel', 'orders:refund'] };

function transactionPrisma({ status = 'COMPLETED', payment = 'PAID', stock = 0, failReturn = false } = {}) {
  const state = { status, payment, stock, audit: [], returns: [], refundedAt: null };
  const tx = {
    order: {
      findFirst: async ({ where }) => where.storeId === actor.storeId ? { id: 'order-1', orderStatus: state.status,
        paymentStatus: state.payment, items: [{ productId: 'product-1', quantity: 2 }] } : null,
      updateMany: async ({ where, data }) => {
        if (where.storeId !== actor.storeId || state.status !== where.orderStatus || (where.paymentStatus && state.payment !== where.paymentStatus)) return { count: 0 };
        state.status = data.orderStatus; state.payment = data.paymentStatus ?? state.payment;
        state.refundedAt = data.refundedAt ?? state.refundedAt; return { count: 1 };
      },
    },
    product: {
      findFirst: async ({ where }) => where.storeId === actor.storeId ? { id: 'product-1', stockQuantity: state.stock } : null,
      updateMany: async ({ where, data }) => {
        if (where.storeId !== actor.storeId || where.stockQuantity !== state.stock) return { count: 0 };
        state.stock += data.stockQuantity.increment; return { count: 1 };
      },
    },
    inventoryTransaction: { create: async ({ data }) => { if (failReturn) throw new Error('return write failed'); state.returns.push(data); return data; } },
    orderAuditEvent: { create: async ({ data }) => { state.audit.push(data); return data; } },
  };
  const prisma = { $transaction: async (callback) => {
    if (Array.isArray(callback)) return Promise.all(callback);
    const before = structuredClone(state);
    try { return await callback(tx); } catch (error) { Object.assign(state, before); throw error; }
  } };
  return { prisma, state };
}

test('Store-local date boundaries use the Store timezone and an exclusive next-day boundary', () => {
  const range = storeDateRange('2026-09-29', '2026-09-29', 'Asia/Ho_Chi_Minh');
  assert.equal(range.gte.toISOString(), '2026-09-28T17:00:00.000Z');
  assert.equal(range.lt.toISOString(), '2026-09-29T17:00:00.000Z');
  assert.equal(storeMidnightUtc('2026-01-01', 'America/New_York').toISOString(), '2026-01-01T05:00:00.000Z');
  assert.throws(() => storeDateRange('2026-02-30', '2026-03-01', 'UTC'), BadRequestException);
  assert.throws(() => storeDateRange('2026-09-30', '2026-09-01', 'UTC'), BadRequestException);
});

test('Refund returns exact item quantity, writes a RETURN audit trail, and rejects a duplicate', async () => {
  const { prisma, state } = transactionPrisma({ stock: 4 });
  const service = new OrdersService(prisma);
  const result = await service.refund(actor, 'order-1', { reason: 'Customer return' });
  assert.equal(result.orderStatus, OrderStatus.REFUNDED);
  assert.equal(result.paymentStatus, PaymentStatus.REFUNDED);
  assert.equal(state.stock, 6);
  assert.equal(state.returns.length, 1);
  assert.equal(state.returns[0].type, 'RETURN');
  assert.equal(state.returns[0].quantity, 2);
  assert.equal(state.returns[0].referenceType, 'ORDER');
  assert.equal(state.returns[0].referenceId, 'order-1');
  assert.equal(state.audit[0].reason, 'Customer return');
  await assert.rejects(() => service.refund(actor, 'order-1', { reason: 'Again' }), ConflictException);
  assert.equal(state.stock, 6);
  assert.equal(state.returns.length, 1);
});

test('Refund rolls back status and inventory if the RETURN history write fails', async () => {
  const { prisma, state } = transactionPrisma({ stock: 4, failReturn: true });
  await assert.rejects(() => new OrdersService(prisma).refund(actor, 'order-1', { reason: 'Return' }));
  assert.equal(state.status, 'COMPLETED');
  assert.equal(state.payment, 'PAID');
  assert.equal(state.stock, 4);
  assert.equal(state.returns.length, 0);
  assert.equal(state.audit.length, 0);
});

test('Cancel only permits pending orders and cannot be applied twice', async () => {
  const { prisma, state } = transactionPrisma({ status: 'PENDING', payment: 'PENDING' });
  const service = new OrdersService(prisma);
  const result = await service.cancel(actor, 'order-1', { reason: 'Duplicate order' });
  assert.equal(result.orderStatus, OrderStatus.CANCELLED);
  assert.equal(state.audit[0].action, 'CANCEL');
  await assert.rejects(() => service.cancel(actor, 'order-1', { reason: 'Again' }), ConflictException);
  const completed = transactionPrisma();
  await assert.rejects(() => new OrdersService(completed.prisma).cancel(actor, 'order-1', { reason: 'Invalid' }), ConflictException);
});

test('Report aggregation is Store scoped and keeps money in Decimal form', async () => {
  const prisma = {
    $queryRaw: async (query) => {
      assert.ok(query.values.includes(actor.storeId), 'Revenue SQL must bind the authenticated Store ID');
      assert.ok(query.values.includes(actor.store.timezone), 'Revenue SQL must group using Store timezone');
      return [{ date: '2026-09-29', sales: new Prisma.Decimal('12.35'), refunds: new Prisma.Decimal('12.35') }];
    },
  };
  const service = new ReportsService(prisma);
  const result = await service.revenueForRange(actor, storeDateRange('2026-09-29', '2026-09-29', actor.store.timezone));
  assert.equal(result.sales, '12.35');
  assert.equal(result.refunds, '12.35');
  assert.equal(result.total, '0');
  assert.equal(result.daily[0].netRevenue, '0');
});
