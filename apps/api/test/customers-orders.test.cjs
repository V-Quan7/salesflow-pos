const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma, CustomerStatus, OrderStatus, PaymentStatus } = require('@prisma/client');
const { CustomersService } = require('../dist/customers/customers.service');
const { OrdersService } = require('../dist/orders/orders.service');

const actor = { id: '10000000-0000-4000-8000-000000000001', storeId: '20000000-0000-4000-8000-000000000001' };

test('Customer service trims fields, normalizes email, scopes reads, deactivates referenced records, and reports paid history', async () => {
  const customer = { id: '30000000-0000-4000-8000-000000000001', storeId: actor.storeId, name: 'Ada', phone: null, email: 'ada@example.test', address: null, note: null, status: 'ACTIVE' };
  const calls = [];
  const prisma = {
    customer: {
      create: async ({ data }) => { calls.push(data); return data; },
      findFirst: async ({ where, include }) => where.storeId === actor.storeId ? (include ? { ...customer, _count: { orders: 2 } } : customer) : null,
      update: async ({ data }) => ({ ...customer, ...data }),
      findUnique: async () => null,
      findMany: async () => [customer], count: async () => 1,
      delete: async () => undefined,
    },
    order: {
      count: async ({ where }) => { assert.equal(where.storeId, actor.storeId); assert.equal(where.orderStatus, OrderStatus.COMPLETED); assert.equal(where.paymentStatus, PaymentStatus.PAID); return 2; },
      aggregate: async () => ({ _sum: { total: new Prisma.Decimal('27.50') } }),
      findMany: async ({ where }) => { assert.equal(where.customerId, customer.id); return [{ orderCode: 'ORD-1', total: new Prisma.Decimal('27.50') }]; },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const service = new CustomersService(prisma);
  const created = await service.create(actor, { name: ' Ada ', email: ' ADA@EXAMPLE.TEST ', phone: ' 123 ' });
  assert.equal(created.name, 'Ada'); assert.equal(created.email, 'ada@example.test'); assert.equal(created.phone, '123');
  const listed = await service.list(actor, { page: 1, limit: 20, search: 'ada', sortBy: 'name', order: 'asc' });
  assert.equal(listed.items.length, 1); assert.equal(listed.total, 1);
  await assert.rejects(() => service.get({ ...actor, storeId: '40000000-0000-4000-8000-000000000001' }, customer.id));
  const deleted = await service.remove(actor, customer.id);
  assert.equal(deleted.deactivated, true);
  assert.equal(deleted.status, CustomerStatus.INACTIVE);
  const history = await service.history(actor, customer.id, { page: 1, limit: 20 });
  assert.equal(history.summary.totalOrders, 2); assert.equal(history.summary.totalPurchaseAmount, '27.5');
  assert.equal(history.orders.total, 2);
});

function orderPrisma({ stock = 5, customerStatus = 'ACTIVE', customerStoreId = actor.storeId, failInventory = false } = {}) {
  const state = { stock, orders: [], transactions: [], failInventory };
  const product = { id: '50000000-0000-4000-8000-000000000001', storeId: actor.storeId, sku: 'SKU-1', name: 'Sample', sellingPrice: new Prisma.Decimal('12.50'), stockQuantity: stock, status: 'ACTIVE', unit: 'each', imageUrl: null, category: { id: '60000000-0000-4000-8000-000000000001', name: 'Group' } };
  const makeTx = () => ({
    store: { findUnique: async ({ where }) => where.id === actor.storeId ? { currency: 'VND' } : null },
    customer: { findFirst: async ({ where }) => where.storeId === customerStoreId && where.id === '30000000-0000-4000-8000-000000000001' ? { id: where.id, status: customerStatus } : null },
    product: {
      findMany: async ({ where }) => where.storeId === actor.storeId && where.id.in.includes(product.id) ? [{ ...product, stockQuantity: state.stock }] : [],
      updateMany: async ({ where, data }) => {
        if (where.id !== product.id || where.storeId !== actor.storeId || where.stockQuantity !== state.stock || state.stock < data.stockQuantity?.decrement) return { count: 0 };
        state.stock -= data.stockQuantity.decrement; return { count: 1 };
      },
    },
    order: { create: async ({ data }) => {
      const row = { ...data, items: data.items.create.map((item, index) => ({ ...item, id: `item-${index}` })) };
      state.orders.push(row); return row;
    } },
    inventoryTransaction: { create: async ({ data }) => {
      if (state.failInventory) throw new Error('simulated inventory write error');
      state.transactions.push(data); return data;
    } },
  });
  const prisma = { $transaction: async (callback) => {
    const old = { stock: state.stock, orders: [...state.orders], transactions: [...state.transactions] };
    try { return await callback(makeTx()); }
    catch (error) { state.stock = old.stock; state.orders = old.orders; state.transactions = old.transactions; throw error; }
  } };
  return { prisma, state };
}

const checkout = (overrides = {}) => ({
  items: [{ productId: '50000000-0000-4000-8000-000000000001', quantity: 2 }, { productId: '50000000-0000-4000-8000-000000000001', quantity: 1 }],
  paymentMethod: 'CASH', discount: '2.25', amountReceived: '40', ...overrides,
});

test('POS checkout merges duplicate items and atomically snapshots price, reduces stock, and records SALE', async () => {
  const { prisma, state } = orderPrisma();
  const order = await new OrdersService(prisma).create(actor, checkout());
  assert.equal(order.orderStatus, OrderStatus.COMPLETED); assert.equal(order.paymentStatus, PaymentStatus.PAID);
  assert.equal(order.subtotal.toString(), '37.5'); assert.equal(order.discount.toString(), '2.25'); assert.equal(order.total.toString(), '35.25');
  assert.equal(order.items.length, 1); assert.equal(order.items[0].quantity, 3); assert.equal(order.items[0].unitPrice.toString(), '12.5');
  assert.equal(order.discountType, 'FIXED'); assert.equal(order.discountValue.toString(), '2.25');
  assert.equal(order.amountReceived.toString(), '40'); assert.equal(order.changeAmount.toString(), '4.75');
  assert.equal(state.stock, 2); assert.equal(state.orders.length, 1);
  assert.equal(state.transactions[0].type, 'SALE'); assert.equal(state.transactions[0].quantity, -3);
  assert.equal(state.transactions[0].beforeQuantity, 5); assert.equal(state.transactions[0].afterQuantity, 2);
  assert.equal(state.transactions[0].referenceType, 'ORDER'); assert.equal(state.transactions[0].referenceId, order.id);
});

test('exact cash tender records zero change', async () => {
  const { prisma } = orderPrisma();
  const order = await new OrdersService(prisma).create(actor, checkout({ discount: '2.25', amountReceived: '35.25' }));
  assert.equal(order.total.toString(), '35.25');
  assert.equal(order.amountReceived.toString(), '35.25');
  assert.equal(order.changeAmount.toString(), '0');
});

test('POS checkout calculates percentage discounts on the server and stores rounded amount plus original value', async () => {
  const { prisma, state } = orderPrisma();
  const order = await new OrdersService(prisma).create(actor, checkout({
    discount: undefined, discountType: 'PERCENTAGE', discountValue: '10', amountReceived: '34',
  }));
  assert.equal(order.discountType, 'PERCENTAGE');
  assert.equal(order.discountValue.toString(), '10');
  assert.equal(order.discount.toString(), '4');
  assert.equal(order.total.toString(), '33.5');
  assert.equal(order.changeAmount.toString(), '0.5');
  assert.equal(state.stock, 2);
});

test('0 percent gives no discount and 100 percent produces a zero total safely', async () => {
  const zero = orderPrisma();
  const zeroOrder = await new OrdersService(zero.prisma).create(actor, checkout({
    discount: undefined, discountType: 'PERCENTAGE', discountValue: '0', amountReceived: '38',
  }));
  assert.equal(zeroOrder.discount.toString(), '0');
  assert.equal(zeroOrder.total.toString(), '37.5');

  const full = orderPrisma();
  const fullOrder = await new OrdersService(full.prisma).create(actor, checkout({
    discount: undefined, discountType: 'PERCENTAGE', discountValue: '100', amountReceived: '0',
  }));
  assert.equal(fullOrder.discount.toString(), '37.5');
  assert.equal(fullOrder.total.toString(), '0');
  assert.equal(fullOrder.changeAmount.toString(), '0');
});

test('POS checkout rejects invalid discounts and insufficient cash while allowing cash with no tender amount', async () => {
  for (const discountValue of ['100.01', '-1']) {
    const { prisma, state } = orderPrisma();
    await assert.rejects(() => new OrdersService(prisma).create(actor, checkout({
      discount: undefined, discountType: 'PERCENTAGE', discountValue,
    })));
    assert.equal(state.orders.length, 0); assert.equal(state.stock, 5);
  }

  const short = orderPrisma();
  await assert.rejects(() => new OrdersService(short.prisma).create(actor, checkout({ amountReceived: '35.24' })));
  assert.equal(short.state.orders.length, 0); assert.equal(short.state.stock, 5);

  const missingCash = orderPrisma();
  const noTenderOrder = await new OrdersService(missingCash.prisma).create(actor, checkout({ amountReceived: undefined }));
  assert.equal(noTenderOrder.amountReceived, null); assert.equal(noTenderOrder.changeAmount, null);
  assert.equal(missingCash.state.orders.length, 1); assert.equal(missingCash.state.stock, 2);

  const nullCash = orderPrisma();
  const nullTenderOrder = await new OrdersService(nullCash.prisma).create(actor, checkout({ amountReceived: null }));
  assert.equal(nullTenderOrder.amountReceived, null); assert.equal(nullTenderOrder.changeAmount, null);

  for (const paymentMethod of ['CARD', 'BANK_TRANSFER', 'E_WALLET']) {
    const { prisma, state } = orderPrisma();
    await assert.rejects(() => new OrdersService(prisma).create(actor, checkout({
      paymentMethod, amountReceived: undefined, manualPaymentConfirmed: false,
    })));
    assert.equal(state.orders.length, 0); assert.equal(state.stock, 5);
  }

  for (const invalid of [
    { paymentMethod: 'CARD', amountReceived: '40', manualPaymentConfirmed: true },
    { paymentMethod: 'CASH', amountReceived: '40', manualPaymentConfirmed: true },
  ]) {
    const { prisma, state } = orderPrisma();
    await assert.rejects(() => new OrdersService(prisma).create(actor, checkout(invalid)));
    assert.equal(state.orders.length, 0); assert.equal(state.stock, 5);
  }
});

test('all non-cash methods require manual confirmation and are recorded without cash tender fields', async () => {
  for (const paymentMethod of ['CARD', 'BANK_TRANSFER', 'E_WALLET']) {
    const { prisma } = orderPrisma();
    const order = await new OrdersService(prisma).create(actor, checkout({
      paymentMethod, amountReceived: undefined, manualPaymentConfirmed: true,
    }));
    assert.equal(order.paymentMethod, paymentMethod);
    assert.equal(order.paymentStatus, PaymentStatus.PAID);
    assert.equal(order.amountReceived, null);
    assert.equal(order.changeAmount, null);
  }
});

test('POS checkout rejects invalid discount, insufficient stock, inactive products, and invalid customer without writes', async () => {
  const tooMuch = orderPrisma();
  await assert.rejects(() => new OrdersService(tooMuch.prisma).create(actor, checkout({ discount: '100' })));
  assert.equal(tooMuch.state.orders.length, 0); assert.equal(tooMuch.state.stock, 5);

  const short = orderPrisma({ stock: 1 });
  await assert.rejects(() => new OrdersService(short.prisma).create(actor, checkout()));
  assert.equal(short.state.orders.length, 0); assert.equal(short.state.stock, 1);

  const foreignCustomer = orderPrisma({ customerStoreId: '40000000-0000-4000-8000-000000000001' });
  await assert.rejects(() => new OrdersService(foreignCustomer.prisma).create(actor, checkout({ customerId: '30000000-0000-4000-8000-000000000001' })));
  assert.equal(foreignCustomer.state.orders.length, 0);

  const inactiveCustomer = orderPrisma({ customerStatus: 'INACTIVE' });
  await assert.rejects(() => new OrdersService(inactiveCustomer.prisma).create(actor, checkout({ customerId: '30000000-0000-4000-8000-000000000001' })));
  assert.equal(inactiveCustomer.state.orders.length, 0);
});

test('POS checkout rolls back order and stock if SALE transaction persistence fails', async () => {
  const { prisma, state } = orderPrisma({ failInventory: true });
  await assert.rejects(() => new OrdersService(prisma).create(actor, checkout()));
  assert.equal(state.orders.length, 0); assert.equal(state.stock, 5); assert.equal(state.transactions.length, 0);
});
