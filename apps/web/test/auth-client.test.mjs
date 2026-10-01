import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import process from 'node:process';

const helperPath = new (await import('node:url')).URL('../lib/auth-client.ts', import.meta.url);
const source = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const authClient = { exports: {} };
vm.runInNewContext(compiled, { exports: authClient.exports, module: authClient, process, fetch: (...args) => globalThis.fetch(...args), Error, Object, JSON, URLSearchParams: globalThis.URLSearchParams, FormData: globalThis.FormData });

let calls;
let response;
beforeEach(() => {
  calls = [];
  response = { ok: true, status: 200, json: async () => ({ id: 'u1' }) };
  globalThis.fetch = async (...args) => { calls.push(args); return response; };
});

test('login sends credentials through cookie based API request', async () => {
  await authClient.exports.login({ storeCode: 'dev-store', email: 'a@b.test', password: 'secret' });
  assert.match(calls[0][0], /\/auth\/login$/);
  assert.equal(calls[0][1].credentials, 'include');
  assert.equal(calls[0][1].body, JSON.stringify({ storeCode: 'dev-store', email: 'a@b.test', password: 'secret' }));
});

test('current user and logout call their endpoints', async () => {
  await authClient.exports.currentUser(); await authClient.exports.logout();
  assert.match(calls[0][0], /\/auth\/me$/);
  assert.match(calls[1][0], /\/auth\/logout$/);
  assert.equal(calls[1][1].method, 'POST');
});

test('first-run setup status and submission use public API endpoints with cookie credentials', async () => {
  response = { ok: true, status: 200, json: async () => ({ setupRequired: true }) };
  assert.deepEqual(JSON.parse(JSON.stringify(await authClient.exports.getSetupStatus())), { setupRequired: true });
  assert.equal(new globalThis.URL(calls[0][0]).pathname, '/api/setup/status');
  assert.equal(calls[0][1].credentials, 'include');

  const input = {
    setupToken: 'operator-supplied-token-that-is-not-a-client-config',
    store: { name: 'Shop', code: 'shop', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
    owner: { name: 'Owner', email: 'owner@example.test', password: 'owner-password-with-12-chars' },
  };
  response = { ok: true, status: 201, json: async () => ({ store: { name: 'Shop', code: 'shop' }, owner: { name: 'Owner', email: 'owner@example.test' } }) };
  const result = await authClient.exports.setupProduction(input);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { store: { name: 'Shop', code: 'shop' }, owner: { name: 'Owner', email: 'owner@example.test' } });
  assert.equal(new globalThis.URL(calls[1][0]).pathname, '/api/setup');
  assert.equal(calls[1][1].method, 'POST');
  assert.equal(calls[1][1].credentials, 'include');
  assert.equal(calls[1][1].body, JSON.stringify(input));
  assert.equal('storeId' in JSON.parse(calls[1][1].body), false);
});

test('public login configuration resolves by Store code without credentials', async () => {
  await authClient.exports.publicStoreConfig('dev-store');
  assert.match(calls[0][0], /\/store\/public-config\/dev-store$/);
  assert.equal(calls[0][1].credentials, 'include');
});

test('401 and 403 are surfaced as typed errors', async () => {
  const { currentUser } = authClient.exports;
  response = { ok: false, status: 401 };
  await assert.rejects(currentUser(), (error) => error.message === 'Unauthenticated' && error.status === 401);
  response = { ok: false, status: 403 };
  await assert.rejects(currentUser(), (error) => error.message === 'Forbidden' && error.status === 403);
});

test('catalog list clients pass pagination, search and filter parameters', async () => {
  await authClient.exports.getProducts({ page: 2, limit: 20, search: 'tea', status: 'ACTIVE', categoryId: 'cat-1' });
  assert.match(calls[0][0], /\/products\?page=2&limit=20&search=tea&status=ACTIVE&categoryId=cat-1$/);
  assert.equal(calls[0][1].credentials, 'include');
  await authClient.exports.getCategories({ page: 1, limit: 10, search: 'food' });
  assert.match(calls[1][0], /\/categories\?page=1&limit=10&search=food$/);
});

test('product image create uses multipart without overriding its content type', async () => {
  const image = new globalThis.Blob(['image'], { type: 'image/png' });
  await authClient.exports.createProduct({ sku: 'SKU-1', name: 'Tea', categoryId: 'cat-1', costPrice: '1', sellingPrice: '2', unit: 'each', stockQuantity: 2, minStock: 0 }, image);
  assert.match(calls[0][0], /\/products$/);
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].credentials, 'include');
  assert.equal(calls[0][1].headers, undefined);
  assert.equal(calls[0][1].body instanceof globalThis.FormData, true);
});

test('product image removal uses the existing PATCH contract', async () => {
  await authClient.exports.updateProduct('product-1', { removeImage: true });
  assert.match(calls[0][0], /\/products\/product-1$/);
  assert.equal(calls[0][1].method, 'PATCH');
  assert.equal(calls[0][1].body.get('removeImage'), 'true');
});

test('Product Excel clients download the template and upload the same .xlsx file without Store selection', async () => {
  response = { ok: true, status: 200, blob: async () => new globalThis.Blob(['template']) };
  const template = await authClient.exports.downloadProductImportTemplate();
  assert.equal(await template.text(), 'template');
  assert.match(calls[0][0], /\/products\/import\/template$/);
  assert.equal(calls[0][1].credentials, 'include');

  response = { ok: true, status: 201, json: async () => ({ totalRows: 1, validRows: 1, errorRows: 0, errors: [], rows: [] }) };
  const file = new globalThis.File(['workbook'], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await authClient.exports.previewProductImport(file);
  assert.match(calls[1][0], /\/products\/import\/preview$/);
  assert.equal(calls[1][1].credentials, 'include');
  assert.equal(calls[1][1].body instanceof globalThis.FormData, true);
  assert.equal(calls[1][1].body.get('file').name, 'products.xlsx');
  assert.equal(calls[1][1].body.has('storeId'), false);

  response = { ok: true, status: 201, json: async () => ({ createdCount: 1 }) };
  await authClient.exports.confirmProductImport(file);
  assert.match(calls[2][0], /\/products\/import$/);
  assert.equal(calls[2][1].method, 'POST');
  assert.equal(calls[2][1].body.get('file').name, 'products.xlsx');
});

test('inventory client sends tenant-neutral list, adjustment, and history requests', async () => {
  await authClient.exports.getInventory({ page: 2, limit: 20, search: 'tea', status: 'ACTIVE', lowStock: true });
  assert.match(calls[0][0], /\/inventory\?page=2&limit=20&search=tea&status=ACTIVE&lowStock=true$/);
  assert.equal(calls[0][1].credentials, 'include');
  await authClient.exports.adjustInventory({ productId: 'product-1', quantity: -2, note: 'damaged' });
  assert.match(calls[1][0], /\/inventory\/adjust$/);
  assert.equal(calls[1][1].method, 'POST');
  assert.equal(calls[1][1].body, JSON.stringify({ productId: 'product-1', quantity: -2, note: 'damaged' }));
  await authClient.exports.getInventoryHistory('product-1', { page: 1, limit: 50 });
  assert.match(calls[2][0], /\/inventory\/product-1\/history\?page=1&limit=50$/);
});

test('Customer and POS clients use the Phase 6/7 HTTP contracts', async () => {
  await authClient.exports.getCustomers({ page: 2, limit: 10, search: 'ada', status: 'ACTIVE' });
  assert.match(calls[0][0], /\/customers\?page=2&limit=10&search=ada&status=ACTIVE$/);
  await authClient.exports.createCustomer({ name: 'Ada', email: 'ada@example.test' });
  assert.match(calls[1][0], /\/customers$/); assert.equal(calls[1][1].method, 'POST');
  await authClient.exports.getCustomerHistory('customer-1', { page: 1, limit: 20 });
  assert.match(calls[2][0], /\/customers\/customer-1\/history\?page=1&limit=20$/);
  await authClient.exports.getPosProducts({ page: 1, limit: 30, search: 'sku' });
  assert.match(calls[3][0], /\/products\/pos\?page=1&limit=30&search=sku$/);
  const checkout = { items: [{ productId: 'product-1', quantity: 2 }], discount: '1.25', paymentMethod: 'CASH' };
  await authClient.exports.createOrder(checkout);
  assert.match(calls[4][0], /\/orders$/); assert.equal(calls[4][1].method, 'POST');
  assert.equal(calls[4][1].body, JSON.stringify(checkout));
});

test('POS barcode lookup trims input, preserves leading zeroes, and uses the authenticated API client', async () => {
  await authClient.exports.getPosProductByBarcode(' 0001234567890 ');
  const url = new globalThis.URL(calls[0][0]);
  assert.equal(url.pathname, '/api/products/pos/lookup');
  assert.equal(url.searchParams.get('barcode'), '0001234567890');
  assert.equal(calls[0][1].credentials, 'include');
});

test('Order and report clients call scoped endpoints and send approved filters/actions', async () => {
  await authClient.exports.getOrders({ page: 2, limit: 10, search: 'ORD', status: 'COMPLETED', dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  assert.match(calls[0][0], /\/orders\?page=2&limit=10&search=ORD&status=COMPLETED&dateFrom=2026-09-01&dateTo=2026-09-30$/);
  await authClient.exports.getOrder('order-1'); assert.match(calls[1][0], /\/orders\/order-1$/);
  await authClient.exports.cancelOrder('order-1', 'duplicate'); assert.equal(calls[2][1].body, JSON.stringify({ reason: 'duplicate' }));
  await authClient.exports.refundOrder('order-1', 'returned'); assert.match(calls[3][0], /\/orders\/order-1\/refund$/);
  await authClient.exports.getDashboardReport(); assert.match(calls[4][0], /\/reports\/dashboard$/);
  await authClient.exports.getRevenueReport('2026-09-01', '2026-09-30');
  assert.match(calls[5][0], /\/reports\/revenue\?dateFrom=2026-09-01&dateTo=2026-09-30$/);
  await authClient.exports.getTopProductsReport('2026-09-01', '2026-09-30', 5);
  assert.match(calls[6][0], /\/reports\/top-products\?dateFrom=2026-09-01&dateTo=2026-09-30&limit=5$/);
  await authClient.exports.getInventoryReport({ state: 'LOW_STOCK', page: 1, limit: 10 });
  assert.match(calls[7][0], /\/reports\/inventory\?state=LOW_STOCK&page=1&limit=10$/);
});

test('user management clients use the documented endpoints, session cookie and server pagination', async () => {
  await authClient.exports.getUsers({ page: 2, limit: 20, search: 'Minh An', status: 'ACTIVE' });
  const listUrl = new globalThis.URL(calls[0][0]);
  assert.equal(listUrl.pathname, '/api/users');
  assert.equal(listUrl.searchParams.get('page'), '2');
  assert.equal(listUrl.searchParams.get('limit'), '20');
  assert.equal(listUrl.searchParams.get('search'), 'Minh An');
  assert.equal(listUrl.searchParams.get('status'), 'ACTIVE');
  assert.equal(calls[0][1].credentials, 'include');
  await authClient.exports.getUsers({ page: 1, limit: 20, status: '' });
  assert.equal(new globalThis.URL(calls[1][0]).searchParams.has('status'), false);

  await authClient.exports.getUser('user-1');
  assert.equal(calls[2][0].endsWith('/users/user-1'), true);
  await authClient.exports.createUser({ name: 'Staff', email: 'staff@example.test', password: 'long-enough-password', roleId: 'role-1' });
  assert.equal(calls[3][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[3][1].body), { name: 'Staff', email: 'staff@example.test', password: 'long-enough-password', roleId: 'role-1' });
  assert.equal('storeId' in JSON.parse(calls[3][1].body), false);
  await authClient.exports.updateUser('user-1', { name: 'Updated', status: 'ACTIVE' });
  assert.equal(calls[4][1].method, 'PATCH');
  await authClient.exports.deactivateUser('user-1');
  assert.equal(calls[5][1].method, 'DELETE');
  await authClient.exports.getRoles();
  assert.equal(calls[6][0].endsWith('/roles'), true);
  await authClient.exports.getPermissions();
  assert.equal(calls[7][0].endsWith('/permissions'), true);
});

test('user API client preserves validation and conflict response details without exposing them to UI automatically', async () => {
  response = { ok: false, status: 409, json: async () => ({ message: 'Email already exists in this store' }) };
  await assert.rejects(authClient.exports.createUser({ name: 'Staff', email: 'duplicate@example.test', password: 'long-enough-password', roleId: 'role-1' }), (error) => {
    assert.equal(error.status, 409);
    assert.deepEqual(JSON.parse(JSON.stringify(error.responseBody)), { message: 'Email already exists in this store' });
    return true;
  });
});
