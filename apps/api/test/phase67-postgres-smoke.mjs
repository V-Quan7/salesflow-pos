import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

try { process.loadEnvFile(resolve(process.cwd(), '../../.env')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }

const prisma = new PrismaClient();
const token = randomBytes(6).toString('hex');
const api = process.env.PHASE67_API_URL || 'http://localhost:3001/api';
const testPassword = randomBytes(32).toString('base64url');
const permissionCodes = [
  'customers:read', 'customers:create', 'customers:update', 'customers:delete', 'orders:create', 'products:read',
  'orders:read', 'orders:update', 'orders:cancel', 'orders:refund', 'reports:read',
];
let primaryStore;
let foreignStore;
let roles = [];
let userIds = [];
let categories = [];
let products = [];
let customerIds = [];
let triggerName;
let functionName;

async function expectStatus(response, expected, label) {
  const body = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, received ${response.status}; ${JSON.stringify(body)}`);
  return body;
}

async function request(path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${api}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(email) {
  const response = await request('/auth/login', { method: 'POST', body: { storeCode: primaryStore.code, email, password: testPassword } });
  assert.equal(response.status, 201, `Smoke test user login failed with HTTP ${response.status}`);
  return response.headers.get('set-cookie')?.split(';')[0];
}

async function createStore(code) {
  return prisma.store.create({ data: { name: 'Phase 6/7 temporary test store', code, currency: 'VND', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' } });
}

async function createRole(storeId, name, permissionIds) {
  const role = await prisma.role.create({ data: { storeId, name } });
  roles.push(role.id);
  await prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })) });
  return role;
}

async function createUser(store, role, email, name) {
  const user = await prisma.user.create({ data: { storeId: store.id, roleId: role.id, name, email,
    status: 'ACTIVE', passwordHash: await argon2.hash(testPassword, { type: argon2.argon2id }) } });
  userIds.push(user.id);
  return user;
}

async function main() {
  assert.equal((await fetch(`${api}/health`)).status, 200, 'API health is unavailable');
  primaryStore = await createStore(`p67-${token}`);
  foreignStore = await createStore(`p67x-${token}`);
  const permissions = await Promise.all(permissionCodes.map((code) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: `Smoke test ${code}` } })));
  const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const ownerRole = await createRole(primaryStore.id, 'OWNER', permissionCodes.map((code) => permissionIds.get(code)));
  const staffRole = await createRole(primaryStore.id, 'STAFF', ['customers:read', 'orders:create', 'orders:read', 'products:read'].map((code) => permissionIds.get(code)));
  const ownerEmail = `p67-owner-${token}@example.test`;
  const staffEmail = `p67-staff-${token}@example.test`;
  await createUser(primaryStore, ownerRole, ownerEmail, 'Temporary smoke owner');
  await createUser(primaryStore, staffRole, staffEmail, 'Temporary smoke staff');
  const ownerCookie = await login(ownerEmail);
  const staffCookie = await login(staffEmail);

  assert.equal((await request('/customers')).status, 401, 'Unauthenticated customer read should return 401');
  assert.equal((await request('/orders', { method: 'POST', body: { items: [], paymentMethod: 'CASH' } })).status, 401, 'Unauthenticated checkout should return 401');
  assert.equal((await request('/customers', { cookie: staffCookie })).status, 200, 'Staff with customers:read should read customers');
  assert.equal((await request('/customers', { method: 'POST', cookie: staffCookie, body: { name: 'Forbidden' } })).status, 403, 'Staff cannot create customers');

  const category = await prisma.category.create({ data: { storeId: primaryStore.id, name: 'Temporary Catalog', slug: `p67-${token}`, status: 'ACTIVE' } });
  categories.push(category.id);
  const product = await prisma.product.create({ data: { storeId: primaryStore.id, categoryId: category.id, sku: `P67-${token}`,
    name: 'Temporary Smoke Product', costPrice: '4', sellingPrice: '12.50', unit: 'item', stockQuantity: 6, minStock: 0, status: 'ACTIVE' } });
  products.push(product.id);
  const inactiveProduct = await prisma.product.create({ data: { storeId: primaryStore.id, categoryId: category.id, sku: `P67-I-${token}`,
    name: 'Temporary Inactive Product', costPrice: '4', sellingPrice: '8', unit: 'item', stockQuantity: 5, minStock: 0, status: 'INACTIVE' } });
  products.push(inactiveProduct.id);

  const foreignCategory = await prisma.category.create({ data: { storeId: foreignStore.id, name: 'Foreign Test Category', slug: `p67-f-${token}`, status: 'ACTIVE' } });
  categories.push(foreignCategory.id);
  const foreignProduct = await prisma.product.create({ data: { storeId: foreignStore.id, categoryId: foreignCategory.id, sku: `P67-F-${token}`,
    name: 'Temporary Foreign Product', costPrice: '1', sellingPrice: '9', unit: 'item', stockQuantity: 5, minStock: 0, status: 'ACTIVE' } });
  products.push(foreignProduct.id);
  const foreignCustomer = await prisma.customer.create({ data: { storeId: foreignStore.id, name: 'Temporary Foreign Customer' } });
  customerIds.push(foreignCustomer.id);
  const foreignOrder = await prisma.order.create({ data: { storeId: foreignStore.id, orderCode: `FOREIGN-${token}`, staffId: userIds[0],
    subtotal: '123456789012345.67', discount: '0', total: '123456789012345.67', paymentMethod: 'CASH', paymentStatus: 'PAID', orderStatus: 'COMPLETED' } });

  const customerResponse = await request('/customers', { method: 'POST', cookie: ownerCookie,
    body: { name: '  Temporary Smoke Customer  ', email: '  SMOKE@EXAMPLE.TEST  ', phone: ' 555 ' } });
  const customer = await expectStatus(customerResponse, 201, 'Create customer');
  customerIds.push(customer.id);
  assert.equal(customer.name, 'Temporary Smoke Customer');
  assert.equal(customer.email, 'smoke@example.test');
  assert.equal(customer.status, 'ACTIVE');
  assert.equal((await expectStatus(await request(`/customers/${customer.id}`, { cookie: ownerCookie }), 200, 'Customer detail')).id, customer.id);
  assert.equal((await request('/customers', { method: 'POST', cookie: ownerCookie, body: { name: 'Tamper', storeId: foreignStore.id } })).status, 400);
  assert.equal((await request(`/customers/${foreignCustomer.id}`, { cookie: ownerCookie })).status, 404);
  const customerList = await expectStatus(await request('/customers?page=1&limit=1&search=smoke', { cookie: ownerCookie }), 200, 'Customer search/pagination');
  assert.equal(customerList.items.length, 1); assert.equal(customerList.total, 1);
  const updated = await expectStatus(await request(`/customers/${customer.id}`, { method: 'PATCH', cookie: ownerCookie, body: { name: 'Updated Smoke Customer', email: ' NEW@EXAMPLE.TEST ' } }), 200, 'Update customer');
  assert.equal(updated.email, 'new@example.test');

  const lookup = await expectStatus(await request(`/products/pos?search=${encodeURIComponent(token)}`, { cookie: ownerCookie }), 200, 'POS product lookup');
  const posProduct = lookup.items.find((item) => item.id === product.id);
  assert.equal(lookup.currency, 'VND');
  assert.ok(posProduct); assert.equal('costPrice' in posProduct, false);
  assert.equal(lookup.items.some((item) => item.id === inactiveProduct.id), false);
  assert.equal(lookup.items.some((item) => item.id === foreignProduct.id), false);
  assert.equal((await request(`/products/pos?storeId=${foreignStore.id}`, { cookie: ownerCookie })).status, 400);
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { storeId: foreignStore.id, items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '100' } })).status, 400);
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 0 }], paymentMethod: 'CASH', amountReceived: '100' } })).status, 400);
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'BITCOIN' } })).status, 400);
  const noTenderCash = await expectStatus(await request('/orders', { method: 'POST', cookie: ownerCookie,
    body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH' } }), 201, 'Cash checkout without tender');
  assert.equal(noTenderCash.amountReceived, null); assert.equal(noTenderCash.changeAmount, null);
  await expectStatus(await request(`/orders/${noTenderCash.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'No tender amount smoke check' } }), 201, 'Restore stock after cash checkout without tender');
  const nullTenderCash = await expectStatus(await request('/orders', { method: 'POST', cookie: ownerCookie,
    body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: null } }), 201, 'Cash checkout with null tender');
  assert.equal(nullTenderCash.amountReceived, null); assert.equal(nullTenderCash.changeAmount, null);
  await expectStatus(await request(`/orders/${nullTenderCash.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Null tender smoke check' } }), 201, 'Restore stock after null tender');
  const emptyTenderCash = await expectStatus(await request('/orders', { method: 'POST', cookie: ownerCookie,
    body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '  ' } }), 201, 'Cash checkout with blank tender');
  assert.equal(emptyTenderCash.amountReceived, null); assert.equal(emptyTenderCash.changeAmount, null);
  await expectStatus(await request(`/orders/${emptyTenderCash.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Blank tender smoke check' } }), 201, 'Restore stock after blank tender');
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '12.49' } })).status, 400, 'Cash checkout rejects insufficient tender');
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '-1' } })).status, 400, 'Cash checkout rejects a negative tender');
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '1e3' } })).status, 400, 'Cash checkout rejects non-decimal notation');
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CARD' } })).status, 400, 'Non-cash checkout requires manual confirmation');
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', discount: '999', amountReceived: '1000' } })).status, 400);
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { customerId: foreignCustomer.id, items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '100' } })).status, 404);
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: foreignProduct.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '100' } })).status, 404);
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: inactiveProduct.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '100' } })).status, 409);

  const sale = await expectStatus(await request('/orders', { method: 'POST', cookie: ownerCookie, body: {
    customerId: customer.id, items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }], discount: '5.00', paymentMethod: 'CARD', manualPaymentConfirmed: true,
  } }), 201, 'Complete POS checkout');
  assert.equal(sale.orderStatus, 'COMPLETED'); assert.equal(sale.paymentStatus, 'PAID');
  assert.equal(sale.subtotal, '37.5'); assert.equal(sale.discount, '5'); assert.equal(sale.total, '32.5');
  assert.equal(sale.discountType, 'FIXED'); assert.equal(sale.discountValue, '5');
  assert.equal(sale.amountReceived, null); assert.equal(sale.changeAmount, null);
  assert.equal(sale.items.length, 1); assert.equal(sale.items[0].quantity, 3);
  const persistedOrder = await prisma.order.findUnique({ where: { id: sale.id }, include: { items: true } });
  const persistedProduct = await prisma.product.findUnique({ where: { id: product.id } });
  const saleTransaction = await prisma.inventoryTransaction.findFirst({ where: { referenceId: sale.id, referenceType: 'ORDER' } });
  assert.equal(persistedOrder.items[0].productNameSnapshot, 'Temporary Smoke Product');
  assert.equal(persistedOrder.items[0].skuSnapshot, product.sku); assert.equal(persistedOrder.items[0].unitPrice.toString(), '12.5');
  assert.equal(persistedProduct.stockQuantity, 3);
  assert.equal(saleTransaction.type, 'SALE'); assert.equal(saleTransaction.quantity, -3);
  assert.equal(saleTransaction.beforeQuantity, 6); assert.equal(saleTransaction.afterQuantity, 3);

  const orderList = await expectStatus(await request(`/orders?search=${encodeURIComponent(sale.orderCode)}&page=1&limit=10`, { cookie: ownerCookie }), 200, 'Order list');
  assert.ok(orderList.items.some((item) => item.id === sale.id));
  assert.equal((await request(`/orders?storeId=${foreignStore.id}`, { cookie: ownerCookie })).status, 400);
  assert.equal((await request(`/orders/${foreignOrder.id}`, { cookie: ownerCookie })).status, 404);
  assert.equal(orderList.items.some((item) => item.id === foreignOrder.id), false);
  const orderDetail = await expectStatus(await request(`/orders/${sale.id}`, { cookie: ownerCookie }), 200, 'Order detail');
  assert.equal(orderDetail.items[0].productNameSnapshot, 'Temporary Smoke Product');
  assert.equal(orderDetail.store.name, primaryStore.name); assert.equal(orderDetail.store.timezone, primaryStore.timezone);
  assert.equal(orderDetail.store.currency, primaryStore.currency); assert.equal(orderDetail.store.locale, primaryStore.locale);
  assert.equal(orderDetail.store.address, primaryStore.address); assert.equal(orderDetail.store.phone, primaryStore.phone);
  assert.equal('passwordHash' in orderDetail.staff, false); assert.equal('email' in orderDetail.staff, false);
  const stockBeforeReceiptRead = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
  const transactionsBeforeReceiptRead = await prisma.inventoryTransaction.count({ where: { referenceId: sale.id } });
  const repeatedReceiptRead = await expectStatus(await request(`/orders/${sale.id}`, { cookie: ownerCookie }), 200, 'Reprint order detail');
  assert.equal(repeatedReceiptRead.id, sale.id); assert.equal(repeatedReceiptRead.createdAt, orderDetail.createdAt);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity, stockBeforeReceiptRead, 'Receipt re-read must not change stock');
  assert.equal(await prisma.inventoryTransaction.count({ where: { referenceId: sale.id } }), transactionsBeforeReceiptRead, 'Receipt re-read must not add inventory history');
  assert.equal((await request('/orders', { cookie: staffCookie })).status, 200, 'Staff with orders:read can read orders');
  assert.equal((await request('/orders/00000000-0000-4000-8000-000000000001/refund', { method: 'POST', cookie: staffCookie, body: { reason: 'No access' } })).status, 403);

  const refundDay = new Intl.DateTimeFormat('en-CA', { timeZone: primaryStore.timezone }).format(new Date());
  const refundResponses = await Promise.all([0, 1].map(() => request(`/orders/${sale.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Customer return' } })));
  assert.deepEqual(refundResponses.map((response) => response.status).sort(), [201, 409], 'Concurrent refund must apply once');
  const refundedOrder = await prisma.order.findUnique({ where: { id: sale.id } });
  assert.equal(refundedOrder.orderStatus, 'REFUNDED'); assert.equal(refundedOrder.paymentStatus, 'REFUNDED');
  assert.ok(refundedOrder.refundedAt); assert.equal(refundedOrder.refundedBy, userIds[0]); assert.equal(refundedOrder.refundReason, 'Customer return');
  const returnTransaction = await prisma.inventoryTransaction.findFirst({ where: { storeId: primaryStore.id, referenceId: sale.id, referenceType: 'ORDER', type: 'RETURN' } });
  assert.equal(returnTransaction.quantity, 3); assert.equal(returnTransaction.beforeQuantity, 3); assert.equal(returnTransaction.afterQuantity, 6);
  assert.equal((await request(`/orders/${sale.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Again' } })).status, 409);
  const afterRefundHistory = await expectStatus(await request(`/customers/${customer.id}/history`, { cookie: ownerCookie }), 200, 'Customer history after refund');
  assert.equal(afterRefundHistory.summary.totalOrders, 0);

  const cashSale = await expectStatus(await request('/orders', { method: 'POST', cookie: ownerCookie, body: {
    items: [{ productId: product.id, quantity: 3 }], discountType: 'PERCENTAGE', discountValue: '10',
    paymentMethod: 'CASH', amountReceived: '40',
  } }), 201, 'Cash checkout with percentage discount');
  assert.equal(cashSale.discountType, 'PERCENTAGE'); assert.equal(cashSale.discountValue, '10');
  assert.equal(cashSale.subtotal, '37.5'); assert.equal(cashSale.discount, '4'); assert.equal(cashSale.total, '33.5');
  assert.equal(cashSale.amountReceived, '40'); assert.equal(cashSale.changeAmount, '6.5');
  const cashStockBeforeReprint = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
  const cashOrderCountBeforeReprint = await prisma.order.count({ where: { storeId: primaryStore.id } });
  const cashTransactionsBeforeReprint = await prisma.inventoryTransaction.count({ where: { referenceId: cashSale.id } });
  const cashReceipt = await expectStatus(await request(`/orders/${cashSale.id}`, { cookie: ownerCookie }), 200, 'Cash receipt details');
  assert.equal(cashReceipt.amountReceived, '40'); assert.equal(cashReceipt.changeAmount, '6.5');
  assert.equal(cashReceipt.store.name, primaryStore.name); assert.equal(cashReceipt.items[0].productNameSnapshot, 'Temporary Smoke Product');
  assert.equal((await request(`/orders/${cashSale.id}`, { cookie: staffCookie })).status, 200, 'Staff with orders:read can reprint receipt');
  const reprintedCashReceipt = await expectStatus(await request(`/orders/${cashSale.id}`, { cookie: ownerCookie }), 200, 'Repeat cash receipt read');
  assert.equal(reprintedCashReceipt.id, cashSale.id); assert.equal(reprintedCashReceipt.paymentStatus, 'PAID');
  assert.equal((await prisma.order.count({ where: { storeId: primaryStore.id } })), cashOrderCountBeforeReprint, 'Reprint must not create another Order');
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity, cashStockBeforeReprint, 'Reprint must not change stock');
  assert.equal(await prisma.inventoryTransaction.count({ where: { referenceId: cashSale.id } }), cashTransactionsBeforeReprint, 'Reprint must not create inventory history');
  await expectStatus(await request(`/orders/${cashSale.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Cash receipt verification' } }), 201, 'Restore stock after cash receipt smoke check');

  const rollbackSale = await expectStatus(await request('/orders', { method: 'POST', cookie: ownerCookie,
    body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '20' } }), 201, 'Create refund rollback fixture');
  const stockBeforeRefundFailure = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
  triggerName = `p67_return_fail_${token.replace(/[^a-z0-9]/gi, '')}`;
  functionName = `p67_return_fn_${token.replace(/[^a-z0-9]/gi, '')}`;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'RETURN'::"InventoryTransactionType" AND NEW."referenceId" = '${rollbackSale.id}'::uuid THEN RAISE EXCEPTION 'temporary return failure'; END IF; RETURN NEW; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
  const refundFailure = await request(`/orders/${rollbackSale.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Rollback probe' } });
  assert.equal(refundFailure.status, 500, 'Forced RETURN write error must abort refund');
  const rollbackOrder = await prisma.order.findUnique({ where: { id: rollbackSale.id } });
  assert.equal(rollbackOrder.orderStatus, 'COMPLETED'); assert.equal(rollbackOrder.paymentStatus, 'PAID');
  assert.equal(rollbackOrder.refundedAt, null); assert.equal(rollbackOrder.refundReason, null);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity, stockBeforeRefundFailure);
  assert.equal(await prisma.inventoryTransaction.count({ where: { referenceId: rollbackSale.id, type: 'RETURN' } }), 0);
  assert.equal(await prisma.orderAuditEvent.count({ where: { orderId: rollbackSale.id } }), 0);
  await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "InventoryTransaction"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  triggerName = undefined; functionName = undefined;
  await expectStatus(await request(`/orders/${rollbackSale.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Retry after rollback' } }), 201, 'Refund after rollback recovery');

  const pendingOrder = await prisma.order.create({ data: { storeId: primaryStore.id, orderCode: `PENDING-${token}`, staffId: userIds[0],
    subtotal: '0', discount: '0', total: '0', paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PENDING' } });
  const cancelled = await expectStatus(await request(`/orders/${pendingOrder.id}/cancel`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Created in error' } }), 201, 'Cancel pending Order');
  assert.equal(cancelled.orderStatus, 'CANCELLED');
  assert.equal((await request(`/orders/${pendingOrder.id}/cancel`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Again' } })).status, 409);
  assert.equal((await request(`/orders/${pendingOrder.id}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'COMPLETED' } })).status, 409);
  assert.equal((await request('/reports/dashboard')).status, 401);
  assert.equal((await request('/reports/dashboard', { cookie: staffCookie })).status, 403, 'Staff does not receive sensitive report access');
  const dashboard = await expectStatus(await request('/reports/dashboard', { cookie: ownerCookie }), 200, 'Dashboard report');
  assert.equal(dashboard.timezone, primaryStore.timezone);
  assert.equal(dashboard.recentOrders.some((order) => order.id === foreignOrder.id), false, 'Dashboard must not include another Store Order');
  const revenue = await expectStatus(await request(`/reports/revenue?dateFrom=${refundDay}&dateTo=${refundDay}`, { cookie: ownerCookie }), 200, 'Revenue report');
  assert.ok(revenue.daily.every((entry) => typeof entry.netRevenue === 'string'));
  const topProducts = await expectStatus(await request(`/reports/top-products?dateFrom=${refundDay}&dateTo=${refundDay}`, { cookie: ownerCookie }), 200, 'Top products report');
  assert.ok(Array.isArray(topProducts.items));
  const inventoryReport = await expectStatus(await request('/reports/inventory?state=OUT_OF_STOCK', { cookie: ownerCookie }), 200, 'Inventory report');
  assert.ok(inventoryReport.summary.outOfStockProducts >= 0);
  assert.equal(inventoryReport.items.some((item) => item.id === foreignProduct.id), false, 'Inventory report must not include another Store');
  assert.equal((await request('/reports/revenue?dateFrom=2026-02-30&dateTo=2026-03-01', { cookie: ownerCookie })).status, 400);

  await prisma.order.create({ data: { storeId: primaryStore.id, orderCode: `CANCEL-${token}`, customerId: customer.id,
    staffId: userIds[0], subtotal: '500', discount: '0', total: '500', paymentMethod: 'CASH', paymentStatus: 'REFUNDED', orderStatus: 'CANCELLED' } });
  const history = await expectStatus(await request(`/customers/${customer.id}/history?page=1&limit=20`, { cookie: ownerCookie }), 200, 'Customer order history');
  assert.equal(history.summary.totalOrders, 0); assert.equal(history.summary.totalPurchaseAmount, '0');
  assert.equal(history.orders.items.length, 0);

  const beforeFailure = await prisma.order.count({ where: { storeId: primaryStore.id } });
  const stockBeforeFailure = (await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity;
  const beforeTransactions = await prisma.inventoryTransaction.count({ where: { storeId: primaryStore.id } });
  const suffix = token.replace(/[^a-z0-9]/gi, '');
  triggerName = `p67_fail_${suffix}`; functionName = `p67_fn_${suffix}`;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."productId" = '${product.id}'::uuid AND NEW."type" = 'SALE'::"InventoryTransactionType" THEN RAISE EXCEPTION 'temporary smoke failure'; END IF; RETURN NEW; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
  const failed = await request('/orders', { method: 'POST', cookie: ownerCookie, body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '20' } });
  assert.equal(failed.status, 500, 'Forced SALE write error should abort checkout');
  assert.equal((await prisma.order.count({ where: { storeId: primaryStore.id } })), beforeFailure, 'Failed checkout order must roll back');
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity, stockBeforeFailure, 'Failed checkout stock must roll back');
  assert.equal((await prisma.inventoryTransaction.count({ where: { storeId: primaryStore.id } })), beforeTransactions, 'Failed checkout history must roll back');
  await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "InventoryTransaction"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  triggerName = undefined; functionName = undefined;

  await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 4 } });
  const itemsBeforeConcurrent = await prisma.orderItem.count({ where: { order: { storeId: primaryStore.id }, productId: product.id } });
  const concurrentBodies = [0, 1].map(() => request('/orders', { method: 'POST', cookie: ownerCookie,
    body: { items: [{ productId: product.id, quantity: 3 }], paymentMethod: 'CASH', amountReceived: '40' } }));
  const concurrent = await Promise.all(concurrentBodies);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stockQuantity, 1, 'Concurrent checkout must not oversell');
  assert.equal((await prisma.orderItem.count({ where: { order: { storeId: primaryStore.id }, productId: product.id } })), itemsBeforeConcurrent + 1);

  const staffOrder = await expectStatus(await request('/orders', { method: 'POST', cookie: staffCookie,
    body: { items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '20' } }), 201, 'Staff order permission');
  assert.equal(staffOrder.staffId, undefined, 'Checkout response must not expose staff internals');
  assert.equal('passwordHash' in staffOrder.staff, false); assert.equal('email' in staffOrder.staff, false);
  const inactive = await expectStatus(await request(`/customers/${customer.id}`, { method: 'DELETE', cookie: ownerCookie }), 200, 'Delete Customer with history');
  assert.equal(inactive.deactivated, true); assert.equal(inactive.status, 'INACTIVE');
  assert.equal((await request('/orders', { method: 'POST', cookie: ownerCookie, body: { customerId: customer.id, items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', amountReceived: '20' } })).status, 400);
  const noHistory = await expectStatus(await request('/customers', { method: 'POST', cookie: ownerCookie, body: { name: 'Temporary Delete Check' } }), 201, 'Create removable Customer');
  customerIds.push(noHistory.id);
  assert.equal((await expectStatus(await request(`/customers/${noHistory.id}`, { method: 'DELETE', cookie: ownerCookie }), 200, 'Hard delete unused Customer')).deleted, true);

  process.stdout.write('PostgreSQL HTTP smoke PASS: login, Customer and Order APIs, Order cancel/refund concurrency, RETURN inventory and rollback integrity, reports/date validation, RBAC/store isolation, POS checkout rollback and no-oversell.\n');
}

async function cleanup() {
  if (triggerName) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "InventoryTransaction"`).catch(() => undefined);
  if (functionName) await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`).catch(() => undefined);
  const storeIds = [primaryStore?.id, foreignStore?.id].filter(Boolean);
  if (!storeIds.length) return;
  await prisma.inventoryTransaction.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.orderAuditEvent.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.orderItem.deleteMany({ where: { order: { storeId: { in: storeIds } } } });
  await prisma.order.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.customer.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.category.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: roles } } });
  await prisma.role.deleteMany({ where: { id: { in: roles } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
}

try {
  await main();
} catch (error) {
  process.stderr.write(`PostgreSQL HTTP smoke FAILED: ${error.stack || error.message}\n`);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => { process.stderr.write(`Temporary test data cleanup failed (code ${error.code || 'unknown'}).\n`); process.exitCode = 1; });
  await prisma.$disconnect();
}
