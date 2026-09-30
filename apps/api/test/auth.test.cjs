const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

process.env.JWT_SECRET = randomBytes(32).toString('hex');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, ServiceUnavailableException } = require('@nestjs/common');
const argon2 = require('argon2');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { StorageService } = require('../dist/storage/storage.service');

const password = 'correct horse battery staple';
const ids = {
  store: '30000000-0000-4000-8000-000000000001',
  ownerRole: '30000000-0000-4000-8000-000000000002',
  staffRole: '30000000-0000-4000-8000-000000000003',
  adminRole: '30000000-0000-4000-8000-000000000008',
  owner: '30000000-0000-4000-8000-000000000004',
  inactive: '30000000-0000-4000-8000-000000000005',
  foreign: '30000000-0000-4000-8000-000000000006',
  staff: '30000000-0000-4000-8000-000000000007',
  admin: '30000000-0000-4000-8000-000000000009',
  category: '60000000-0000-4000-8000-000000000001',
  usedCategory: '60000000-0000-4000-8000-000000000002',
  foreignCategory: '40000000-0000-4000-8000-000000000010',
  product: '70000000-0000-4000-8000-000000000001',
  usedProduct: '70000000-0000-4000-8000-000000000002',
  foreignProduct: '40000000-0000-4000-8000-000000000011',
};
const storeRecord = {
  id: ids.store, code: 'TEST', name: 'Test Store', logoUrl: 'https://assets.example.test/old-logo.png', faviconUrl: null,
  slogan: null, description: null, phone: null, email: null, address: null, website: null,
  currency: 'VND', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', primaryColor: '#334155', secondaryColor: '#475569',
};
const settingRows = [
  ['store.displayNameShort', 'Test Store'], ['store.browserTitle', 'Test Store'],
  ['store.operatingHours', 'Development environment'], ['branding.accentColor', '#475569'],
  ['terminology.customer', 'Customer'], ['terminology.product', 'Product'], ['terminology.order', 'Order'],
].map(([key, value]) => ({ storeId: ids.store, key, value, valueType: 'STRING', description: null, updatedAt: new Date() }));
const contentRows = [
  ['app.login.title', 'Login title', 'Sign in'], ['app.login.description', 'Login description', 'Development environment'],
  ['dashboard.welcome', 'Dashboard welcome', 'Welcome'], ['dashboard.subtitle', 'Dashboard subtitle', 'Development dashboard'],
  ['pos.empty_cart', 'Empty cart', 'No items in cart'], ['pos.payment_success', 'Payment success', 'Payment recorded in development environment'],
  ['order.success', 'Order success', 'Order created in development environment'], ['inventory.low_stock_message', 'Low stock message', 'Stock is below the configured minimum'],
  ['footer.about', 'Footer about', 'Development environment'], ['footer.notice', 'Footer notice', 'Development data only'],
].map(([key, title, content]) => ({ storeId: ids.store, key, title, content, type: 'text', isActive: true, updatedAt: new Date() }));

let server;
let base;
let ownerCookie;
let prisma;
let testUsers;
let testCategories;
let testProducts;
let testInventoryTransactions;

before(async () => {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const codes = ['users:read', 'users:create', 'users:update', 'users:delete', 'roles:read', 'permissions:read', 'auth:me',
    'store:read', 'store:update', 'settings:read', 'settings:update', 'content:read', 'content:update', 'assets:upload', 'assets:delete',
    'products:read', 'products:create', 'products:update', 'products:delete', 'categories:read', 'categories:create', 'categories:update', 'categories:delete', 'inventory:read', 'inventory:adjust'];
  const permissions = codes.map((code) => ({ permission: { code } }));
  const adminCodes = new Set(codes.filter((code) => code !== 'users:delete'));
  const role = (id, name, storeId, grant) => ({ id, name, storeId, permissions: grant ? permissions : name === 'ADMIN' ? permissions.filter(({ permission }) => adminCodes.has(permission.code)) : ['auth:me', 'products:read', 'categories:read', 'inventory:read'].map((code) => ({ permission: { code } })) });
  const users = [
    { id: ids.owner, name: 'Test Owner', email: 'owner@example.test', passwordHash: hash, status: 'ACTIVE', storeId: ids.store, roleId: ids.ownerRole, store: { id: ids.store, code: 'TEST', name: 'Test Store' }, role: role(ids.ownerRole, 'OWNER', ids.store, true) },
    { id: ids.inactive, name: 'Inactive', email: 'inactive@example.test', passwordHash: hash, status: 'INACTIVE', storeId: ids.store, roleId: ids.staffRole, store: { id: ids.store, code: 'TEST', name: 'Test Store' }, role: role(ids.staffRole, 'STAFF', ids.store, false) },
    { id: ids.foreign, name: 'Other Store User', email: 'foreign@example.test', passwordHash: hash, status: 'ACTIVE', storeId: '40000000-0000-4000-8000-000000000001', roleId: ids.staffRole, store: { id: '40000000-0000-4000-8000-000000000001', code: 'OTHER', name: 'Other Store' }, role: role(ids.staffRole, 'STAFF', '40000000-0000-4000-8000-000000000001', false) },
    { id: ids.staff, name: 'Active Staff', email: 'staff@example.test', passwordHash: hash, status: 'ACTIVE', storeId: ids.store, roleId: ids.staffRole, store: { id: ids.store, code: 'TEST', name: 'Test Store' }, role: role(ids.staffRole, 'STAFF', ids.store, false) },
    { id: ids.admin, name: 'Test Admin', email: 'admin@example.test', passwordHash: hash, status: 'ACTIVE', storeId: ids.store, roleId: ids.adminRole, store: { id: ids.store, code: 'TEST', name: 'Test Store' }, role: role(ids.adminRole, 'ADMIN', ids.store, false) },
  ];
  testUsers = users;
  const now = new Date();
  testCategories = [
    { id: ids.category, storeId: ids.store, name: 'Drinks', slug: 'drinks', description: null, status: 'ACTIVE', createdAt: now, updatedAt: now },
    { id: ids.usedCategory, storeId: ids.store, name: 'Used', slug: 'used', description: null, status: 'ACTIVE', createdAt: now, updatedAt: now },
    { id: ids.foreignCategory, storeId: '40000000-0000-4000-8000-000000000001', name: 'Foreign', slug: 'foreign', description: null, status: 'ACTIVE', createdAt: now, updatedAt: now },
  ];
  testProducts = [
    { id: ids.product, storeId: ids.store, categoryId: ids.category, sku: 'DRINK-1', name: 'Water', description: null, imageUrl: null, costPrice: '5', sellingPrice: '10', unit: 'bottle', stockQuantity: 4, minStock: 1, status: 'ACTIVE', orderItemCount: 0, inventoryTransactionCount: 0, createdAt: now, updatedAt: now },
    { id: ids.usedProduct, storeId: ids.store, categoryId: ids.usedCategory, sku: 'SOLD-1', name: 'Sold item', description: null, imageUrl: 'https://assets.example.test/product-old.png', costPrice: '5', sellingPrice: '10', unit: 'each', stockQuantity: 0, minStock: 0, status: 'ACTIVE', orderItemCount: 1, inventoryTransactionCount: 0, createdAt: now, updatedAt: now },
    { id: ids.foreignProduct, storeId: '40000000-0000-4000-8000-000000000001', categoryId: ids.foreignCategory, sku: 'OTHER-1', name: 'Foreign item', description: null, imageUrl: null, costPrice: '1', sellingPrice: '2', unit: 'each', stockQuantity: 0, minStock: 0, status: 'ACTIVE', orderItemCount: 0, inventoryTransactionCount: 0, createdAt: now, updatedAt: now },
  ];
  testInventoryTransactions = [];
  globalThis.__inventoryTransactions = testInventoryTransactions;
  const sessions = new Map();
  const uploadedAssets = [];
  const assetEvents = [];
  const storage = {
    isLocal: true,
    failUpload: false,
    upload: async (_storeId, kind) => { assetEvents.push('upload'); if (storage.failUpload) throw new ServiceUnavailableException('Asset storage is unavailable'); const asset = { url: `https://assets.example.test/${kind}-${uploadedAssets.length + 1}.png`, key: `asset-${uploadedAssets.length + 1}` }; uploadedAssets.push(asset); return asset; },
    delete: async (key) => { assetEvents.push('cleanup'); uploadedAssets.push({ deleted: key }); },
    readLocal: async () => ({ buffer: Buffer.from('asset'), contentType: 'image/png' }),
  };
  globalThis.__assetEvents = assetEvents;
  const store = { id: ids.store, code: 'TEST', name: 'Test Store' };
  prisma = {
    $connect: async () => {}, $disconnect: async () => {},
    store: {
      findUnique: async ({ where }) => where.code ? (where.code === storeRecord.code ? { ...storeRecord } : null) : (where.id === ids.store ? { ...storeRecord } : null),
      findUniqueOrThrow: async ({ where }) => { if (where.id !== ids.store) throw Error('not found'); return { ...storeRecord }; },
      update: async ({ where, data }) => {
        if (where.id !== ids.store) throw Error('not found');
        if (data.code && data.code !== storeRecord.code) throw Object.assign(Error('unique'), { code: 'P2002' });
        Object.assign(storeRecord, data); return { ...storeRecord };
      },
    },
    storeSetting: {
      findMany: async ({ where }) => settingRows.filter((row) => row.storeId === where.storeId && (!where.key || row.key === where.key || where.key.in?.includes(row.key))).map(({ key, value, valueType, description, updatedAt }) => ({ key, value, valueType, description, updatedAt })),
      upsert: async ({ where, update, create }) => {
        let row = settingRows.find((item) => item.storeId === where.storeId_key.storeId && item.key === where.storeId_key.key);
        if (row) Object.assign(row, update); else { row = { ...create, updatedAt: new Date() }; settingRows.push(row); }
        return row;
      },
    },
    contentBlock: {
      findMany: async ({ where }) => contentRows.filter((row) => row.storeId === where.storeId && (!where.key || row.key === where.key || where.key.in?.includes(row.key)) && (where.isActive === undefined || row.isActive === where.isActive)),
      findUnique: async ({ where }) => contentRows.find((row) => row.storeId === where.storeId_key.storeId && row.key === where.storeId_key.key) ?? null,
      upsert: async ({ where, update, create }) => {
        let row = contentRows.find((item) => item.storeId === where.storeId_key.storeId && item.key === where.storeId_key.key);
        if (row) Object.assign(row, update, { updatedAt: new Date() }); else { row = { ...create, updatedAt: new Date() }; contentRows.push(row); }
        return row;
      },
    },
    category: {
      findMany: async ({ where, skip = 0, take, orderBy }) => {
        let rows = testCategories.filter((row) => row.storeId === where.storeId && (!where.status || row.status === where.status));
        if (where.OR) rows = rows.filter((row) => where.OR.some((condition) => Object.entries(condition).some(([field, filter]) => row[field].toLowerCase().includes(filter.contains.toLowerCase()))));
        const [field, direction] = Object.entries(orderBy)[0] ?? ['name', 'asc'];
        rows.sort((a, b) => direction === 'asc' ? String(a[field]).localeCompare(String(b[field])) : String(b[field]).localeCompare(String(a[field])));
        return rows.slice(skip, skip + take).map((row) => ({ ...row, _count: { products: testProducts.filter((product) => product.categoryId === row.id).length } }));
      },
      count: async ({ where }) => testCategories.filter((row) => row.storeId === where.storeId && (!where.status || row.status === where.status) && (!where.OR || where.OR.some((condition) => Object.entries(condition).some(([field, filter]) => row[field].toLowerCase().includes(filter.contains.toLowerCase()))))).length,
      findFirst: async ({ where }) => {
        const row = testCategories.find((category) => (!where.id || (typeof where.id === 'string' ? category.id === where.id : category.id !== where.id.not)) && (!where.storeId || category.storeId === where.storeId) && (!where.slug || category.slug === where.slug));
        if (!row) return null;
        return { ...row, ...(where.id && testProducts !== undefined ? { _count: { products: testProducts.filter((product) => product.categoryId === row.id).length } } : {}) };
      },
      create: async ({ data }) => {
        if (testCategories.some((row) => row.storeId === data.storeId && row.slug === data.slug)) throw Object.assign(Error('unique'), { code: 'P2002' });
        const row = { ...data, id: require('node:crypto').randomUUID(), createdAt: now, updatedAt: now };
        testCategories.push(row); return { ...row };
      },
      update: async ({ where, data }) => {
        const row = testCategories.find((category) => category.id === where.id);
        if (!row) throw Error('not found');
        if (data.slug && testCategories.some((category) => category.id !== row.id && category.storeId === row.storeId && category.slug === data.slug)) throw Object.assign(Error('unique'), { code: 'P2002' });
        Object.assign(row, data, { updatedAt: now }); return { ...row };
      },
      delete: async ({ where }) => {
        const index = testCategories.findIndex((category) => category.id === where.id);
        if (testProducts.some((product) => product.categoryId === where.id)) throw Object.assign(Error('foreign key'), { code: 'P2003' });
        if (index < 0) throw Error('not found');
        return testCategories.splice(index, 1)[0];
      },
    },
    product: {
      fields: { minStock: { field: 'minStock' } },
      findMany: async ({ where, skip = 0, take, orderBy, include }) => {
        let rows = testProducts.filter((row) => row.storeId === where.storeId && (!where.status || row.status === where.status) && (!where.categoryId || row.categoryId === where.categoryId));
        if (where.stockQuantity?.lte === prisma.product.fields.minStock) rows = rows.filter((row) => row.stockQuantity <= row.minStock);
        if (where.NOT?.stockQuantity?.lte === prisma.product.fields.minStock) rows = rows.filter((row) => !(where.NOT.status === row.status && row.stockQuantity <= row.minStock));
        if (where.OR) rows = rows.filter((row) => where.OR.some((condition) => Object.entries(condition).some(([field, filter]) => row[field].toLowerCase().includes(filter.contains.toLowerCase()))));
        const [field, direction] = Object.entries(orderBy)[0] ?? ['createdAt', 'desc'];
        rows.sort((a, b) => direction === 'asc' ? String(a[field]).localeCompare(String(b[field])) : String(b[field]).localeCompare(String(a[field])));
        return rows.slice(skip, skip + take).map((row) => ({ ...row, category: testCategories.find((category) => category.id === row.categoryId) }));
      },
      count: async ({ where }) => testProducts.filter((row) => row.storeId === where.storeId && (!where.status || row.status === where.status) && (!where.categoryId || row.categoryId === where.categoryId) && (!where.OR || where.OR.some((condition) => Object.entries(condition).some(([field, filter]) => row[field].toLowerCase().includes(filter.contains.toLowerCase())))) && (where.stockQuantity?.lte !== prisma.product.fields.minStock || row.stockQuantity <= row.minStock) && (!where.NOT || !(where.NOT.status === row.status && row.stockQuantity <= row.minStock))).length,
      findFirst: async ({ where, include }) => {
        const row = testProducts.find((product) => product.id === where.id && product.storeId === where.storeId);
        if (!row) return null;
        return { ...row, ...(include?._count ? { _count: { orderItems: row.orderItemCount, inventoryTransactions: row.inventoryTransactionCount } } : {}), category: testCategories.find((category) => category.id === row.categoryId) };
      },
      create: async ({ data }) => {
        if (testProducts.some((row) => row.storeId === data.storeId && row.sku === data.sku)) throw Object.assign(Error('unique'), { code: 'P2002' });
        const row = { ...data, id: require('node:crypto').randomUUID(), orderItemCount: 0, inventoryTransactionCount: 0, createdAt: now, updatedAt: now };
        testProducts.push(row); return { ...row, category: testCategories.find((category) => category.id === row.categoryId) };
      },
      updateMany: async ({ where, data }) => {
        const row = testProducts.find((product) => product.id === where.id && product.storeId === where.storeId && product.stockQuantity === where.stockQuantity);
        if (!row) return { count: 0 };
        row.stockQuantity += data.stockQuantity.increment;
        row.updatedAt = now;
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        globalThis.__assetEvents.push('db-update');
        const row = testProducts.find((product) => product.id === where.id);
        if (!row) throw Error('not found');
        if (data.sku && testProducts.some((product) => product.id !== row.id && product.storeId === row.storeId && product.sku === data.sku)) throw Object.assign(Error('unique'), { code: 'P2002' });
        Object.assign(row, data, { updatedAt: now });
        return { ...row, category: testCategories.find((category) => category.id === row.categoryId) };
      },
      delete: async ({ where }) => {
        const index = testProducts.findIndex((product) => product.id === where.id);
        const row = testProducts[index];
        if (row?.orderItemCount || row?.inventoryTransactionCount) throw Object.assign(Error('foreign key'), { code: 'P2003' });
        if (index < 0) throw Error('not found');
        return testProducts.splice(index, 1)[0];
      },
    },
    user: {
      findFirst: async ({ where }) => users.find((u) => (where.store?.code ? u.store.code === where.store.code : true) && (where.storeId ? u.storeId === where.storeId : true) && (where.id ? u.id === where.id : true) && (where.email ? u.email === where.email : true)) ?? null,
      findUnique: async ({ where }) => users.find((u) => u.id === where.id || (where.storeId_email && u.storeId === where.storeId_email.storeId && u.email === where.storeId_email.email)) ?? null,
      findMany: async ({ where }) => users.filter((u) => !where.storeId || u.storeId === where.storeId),
      count: async ({ where }) => users.filter((u) => !where.storeId || u.storeId === where.storeId).length,
      create: async ({ data }) => { const u = { ...data, id: `50000000-0000-4000-8000-${randomBytes(6).toString('hex')}`, store, role: role(data.roleId, 'STAFF', data.storeId, false) }; users.push(u); return { ...u, passwordHash: undefined }; },
      update: async ({ where, data }) => { const u = users.find((x) => x.id === where.id && (!where.storeId || x.storeId === where.storeId)); if (!u) throw Error('not found'); Object.assign(u, data); return { ...u, passwordHash: undefined }; },
    },
    inventoryTransaction: {
      create: async ({ data, include }) => {
        if (globalThis.__failInventoryTransactionCreate) throw Error('simulated inventory history write failure');
        const row = { ...data, id: require('node:crypto').randomUUID(), createdAt: now,
          creator: include?.creator ? { id: data.createdBy, name: users.find((user) => user.id === data.createdBy)?.name } : undefined };
        testInventoryTransactions.push(row);
        const product = testProducts.find((item) => item.id === data.productId);
        if (product) product.inventoryTransactionCount += 1;
        return row;
      },
      findMany: async ({ where, skip = 0, take, orderBy, include }) => {
        const rows = testInventoryTransactions.filter((row) => row.storeId === where.storeId && row.productId === where.productId);
        rows.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
        return rows.slice(skip, skip + take).map((row) => ({ ...row, creator: include?.creator ? { id: row.createdBy, name: users.find((user) => user.id === row.createdBy)?.name } : undefined }));
      },
      count: async ({ where }) => testInventoryTransactions.filter((row) => row.storeId === where.storeId && row.productId === where.productId).length,
    },
    authSession: {
      create: async ({ data }) => { const s = { id: randomBytes(16).toString('hex'), ...data, revokedAt: null, userId: data.userId }; sessions.set(s.id, s); return s; },
      findUnique: async ({ where }) => { const s = sessions.get(where.id); const u = users.find((x) => x.id === s?.userId); return s && u ? { ...s, user: u } : null; },
      updateMany: async ({ where, data }) => { const s = sessions.get(where.id); if (s && !s.revokedAt) Object.assign(s, data); return { count: s ? 1 : 0 }; },
    },
    role: {
      findUnique: async ({ where }) => ({ storeId: where.id === ids.ownerRole ? ids.store : null, permissions: [] }),
      findMany: async () => [],
    },
    permission: { findMany: async () => codes.map((code, index) => ({ id: String(index), code, description: code })) },
    $transaction: async (queries) => {
      if (Array.isArray(queries)) return Promise.all(queries);
      const productSnapshot = testProducts.map((product) => ({ ...product }));
      const transactionSnapshot = testInventoryTransactions.map((transaction) => ({ ...transaction }));
      try { return await queries(prisma); }
      catch (error) {
        testProducts.splice(0, testProducts.length, ...productSnapshot);
        testInventoryTransactions.splice(0, testInventoryTransactions.length, ...transactionSnapshot);
        throw error;
      }
    },
  };
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma)
    .overrideProvider(StorageService).useValue(storage).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  await app.init();
  await new Promise((resolve) => { server = app.getHttpServer().listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  globalThis.__app = app;
  globalThis.__storage = storage;
  globalThis.__assets = uploadedAssets;
  globalThis.__categories = testCategories;
  globalThis.__products = testProducts;
  globalThis.__store = storeRecord;
  globalThis.__settings = settingRows;
  globalThis.__content = contentRows;
});

after(async () => { await globalThis.__app?.close(); });

test('login success returns safe user and sets HttpOnly cookie', async () => {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'owner@example.test', password }) });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.email, 'owner@example.test');
  assert.equal('passwordHash' in body, false);
  ownerCookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
});

test('bad password, unknown user, and inactive user are rejected generically', async () => {
  for (const email of ['owner@example.test', 'unknown@example.test', 'inactive@example.test']) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email, password: email === 'owner@example.test' ? 'wrong password here' : password }) });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: 'Invalid credentials', error: 'Unauthorized', statusCode: 401 });
  }
});

test('auth me is protected, and logout revokes server session', async () => {
  assert.equal((await fetch(`${base}/auth/me`)).status, 401);
  const me = await fetch(`${base}/auth/me`, { headers: { cookie: ownerCookie } });
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.id, ids.owner);
  assert.equal('passwordHash' in body, false);
  assert.equal((await fetch(`${base}/users`, { headers: { cookie: ownerCookie } })).status, 200);
  const loggedOut = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: ownerCookie } });
  assert.equal(loggedOut.status, 201);
  assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: ownerCookie } })).status, 401);
});

test('user scopes enforce multi-store isolation and RBAC', async () => {
  const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'owner@example.test', password }) });
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const other = await fetch(`${base}/users/${ids.foreign}`, { headers: { cookie } });
  assert.equal(other.status, 404);
  assert.equal((await fetch(`${base}/roles`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/permissions`, { headers: { cookie } })).status, 200);
  const staffLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'inactive@example.test', password }) });
  assert.equal(staffLogin.status, 401);
});

test('users CRUD validates, hashes credentials, and deactivates without returning hashes', async () => {
  const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'owner@example.test', password }) });
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const created = await fetch(`${base}/users`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'New Staff', email: 'new@example.test', password, roleId: ids.ownerRole }) });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.passwordHash, undefined);
  assert.equal(testUsers.find((user) => user.email === 'new@example.test').passwordHash === password, false);
  const updated = await fetch(`${base}/users/${body.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Updated Staff' }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).name, 'Updated Staff');
  const removed = await fetch(`${base}/users/${body.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).status, 'INACTIVE');
});

test('store config APIs require authentication and permission and stay scoped to the authenticated store', async () => {
  assert.equal((await fetch(`${base}/store`)).status, 401);
  const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'owner@example.test', password }) });
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const store = await fetch(`${base}/store`, { headers: { cookie } });
  assert.equal(store.status, 200);
  assert.equal((await store.json()).id, ids.store);
  const crossStoreAttempt = await fetch(`${base}/store`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ storeId: '40000000-0000-4000-8000-000000000001', name: 'Other Store' }) });
  assert.equal(crossStoreAttempt.status, 400);
  const settings = await fetch(`${base}/store/settings`, { headers: { cookie } });
  assert.equal((await settings.json()).length, 7);
  const unknownSetting = await fetch(`${base}/store/settings`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ settings: { 'secret.token': 'no' } }) });
  assert.equal(unknownSetting.status, 400);
  const savedSettings = await fetch(`${base}/store/settings`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ settings: { 'store.browserTitle': 'Configured title' } }) });
  assert.equal(savedSettings.status, 200);
  assert.equal(globalThis.__settings.find((row) => row.key === 'store.browserTitle').value, 'Configured title');
  const adminLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'admin@example.test', password }) });
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
  const adminUpdate = await fetch(`${base}/store`, { method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ slogan: 'Store slogan' }) });
  assert.equal(adminUpdate.status, 200);
  const duplicateCode = await fetch(`${base}/store`, { method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'DUPLICATE' }) });
  assert.equal(duplicateCode.status, 409);
  const staff = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'inactive@example.test', password }) });
  assert.equal(staff.status, 401);
  const activeStaffLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'staff@example.test', password }) });
  const staffConfig = await fetch(`${base}/store`, { headers: { cookie: activeStaffLogin.headers.get('set-cookie').split(';')[0] } });
  assert.equal(staffConfig.status, 403);
});

test('content blocks can update, reset to code defaults, and only public-safe data is unauthenticated', async () => {
  const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'owner@example.test', password }) });
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const update = await fetch(`${base}/store/content/app.login.title`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Changed', content: 'Welcome here', isActive: true }) });
  assert.equal(update.status, 200);
  const reset = await fetch(`${base}/store/content/app.login.title/reset`, { method: 'POST', headers: { cookie } });
  assert.equal(reset.status, 201);
  assert.equal((await reset.json()).content, 'Sign in');
  const publicConfig = await fetch(`${base}/store/public-config/TEST`);
  const publicBody = await publicConfig.text();
  assert.equal(publicConfig.status, 200, publicBody);
  const body = JSON.parse(publicBody);
  assert.equal(body.store.code, 'TEST');
  assert.equal(body.store.shortName, 'Test Store');
  assert.equal(body.store.locale, 'vi-VN');
  assert.equal('phone' in body.store, false);
  assert.equal('email' in body.store, false);
  assert.equal('users' in body, false);
});

test('logo upload checks image signatures and keeps the current asset when file data is invalid', async () => {
  const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email: 'owner@example.test', password }) });
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const invalid = new FormData(); invalid.set('file', new Blob(['not an image'], { type: 'image/png' }), 'logo.png');
  const denied = await fetch(`${base}/store/logo`, { method: 'POST', headers: { cookie }, body: invalid });
  assert.equal(denied.status, 400);
  assert.equal(globalThis.__store.logoUrl, 'https://assets.example.test/old-logo.png');
  const valid = new FormData(); valid.set('file', new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'logo.png');
  globalThis.__storage.failUpload = true;
  const failedUpload = await fetch(`${base}/store/logo`, { method: 'POST', headers: { cookie }, body: valid });
  assert.equal(failedUpload.status, 503);
  assert.equal(globalThis.__store.logoUrl, 'https://assets.example.test/old-logo.png');
  globalThis.__storage.failUpload = false;
  const success = await fetch(`${base}/store/logo`, { method: 'POST', headers: { cookie }, body: valid });
  assert.equal(success.status, 201);
  assert.equal(globalThis.__store.logoUrl, 'https://assets.example.test/logo-1.png');
  assert.ok(globalThis.__assets.some((asset) => asset.deleted === 'https://assets.example.test/old-logo.png'));
  const faviconUpload = await fetch(`${base}/store/favicon`, { method: 'POST', headers: { cookie }, body: valid });
  assert.equal(faviconUpload.status, 201);
  const faviconDelete = await fetch(`${base}/store/favicon`, { method: 'DELETE', headers: { cookie } });
  assert.equal(faviconDelete.status, 200);
  assert.equal(globalThis.__store.faviconUrl, null);
  const logoDelete = await fetch(`${base}/store/logo`, { method: 'DELETE', headers: { cookie } });
  assert.equal(logoDelete.status, 200);
  assert.equal(globalThis.__store.logoUrl, null);
});

async function catalogLogin(email = 'owner@example.test') {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeCode: 'TEST', email, password }) });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
}

const categoryPayload = (overrides = {}) => ({ name: 'Snacks', slug: 'snacks', description: 'Shelf snacks', status: 'ACTIVE', ...overrides });
const productPayload = (overrides = {}) => ({ categoryId: ids.category, sku: 'SNACK-1', name: 'Snack', description: '', costPrice: 5, sellingPrice: 10, unit: 'piece', stockQuantity: 5, minStock: 1, status: 'ACTIVE', ...overrides });

test('Category CRUD enforces tenant scope, slug uniqueness, filters and safe deletion', async () => {
  const cookie = await catalogLogin();
  const created = await fetch(`${base}/categories`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(categoryPayload()) });
  assert.equal(created.status, 201);
  const category = await created.json();
  assert.equal(category.storeId, ids.store);

  const duplicate = await fetch(`${base}/categories`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(categoryPayload({ slug: 'drinks' })) });
  assert.equal(duplicate.status, 409);
  const list = await fetch(`${base}/categories?page=1&limit=10&search=snack&status=ACTIVE`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).items.some((item) => item.id === category.id), true);

  const updated = await fetch(`${base}/categories/${category.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Crisps', status: 'INACTIVE' }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).status, 'INACTIVE');
  const foreign = await fetch(`${base}/categories/${ids.foreignCategory}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Not yours' }) });
  assert.equal(foreign.status, 404);

  const removed = await fetch(`${base}/categories/${ids.usedCategory}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).deactivated, true);
  const deleted = await fetch(`${base}/categories/${category.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).deleted, true);
});

test('Product CRUD enforces SKU uniqueness, same-store Category and product Store isolation', async () => {
  const cookie = await catalogLogin();
  assert.equal((await fetch(`${base}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(productPayload()) })).status, 401);
  const created = await fetch(`${base}/products`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(productPayload()) });
  assert.equal(created.status, 201);
  const product = await created.json();
  assert.equal(product.storeId, ids.store);
  assert.equal(product.sku, 'SNACK-1');
  assert.equal(product.category.id, ids.category);
  assert.equal(testInventoryTransactions.some((entry) => entry.productId === product.id && entry.beforeQuantity === 0 && entry.afterQuantity === 5), true);

  const duplicate = await fetch(`${base}/products`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(productPayload({ sku: 'snack-1' })) });
  assert.equal(duplicate.status, 409);
  const foreignCategory = await fetch(`${base}/products`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(productPayload({ categoryId: ids.foreignCategory, sku: 'FOREIGN-CAT' })) });
  assert.equal(foreignCategory.status, 400);
  const forbiddenStoreChoice = await fetch(`${base}/products`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(productPayload({ storeId: '40000000-0000-4000-8000-000000000001' })) });
  assert.equal(forbiddenStoreChoice.status, 400);
  assert.equal((await fetch(`${base}/products/${ids.foreignProduct}`, { headers: { cookie } })).status, 404);

  const list = await fetch(`${base}/products?page=1&limit=10&search=snack&categoryId=${ids.category}&status=ACTIVE`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).items.some((item) => item.id === product.id), true);
  const detail = await fetch(`${base}/products/${product.id}`, { headers: { cookie } });
  assert.equal(detail.status, 200);
  const update = await fetch(`${base}/products/${product.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ sellingPrice: '12.50', status: 'INACTIVE' }) });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).status, 'INACTIVE');
  const stockEdit = await fetch(`${base}/products/${product.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ stockQuantity: 999 }) });
  assert.equal(stockEdit.status, 400);

  const referenced = await fetch(`${base}/products/${ids.usedProduct}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(referenced.status, 200);
  assert.equal((await referenced.json()).deactivated, true);
  const removable = await fetch(`${base}/products/${product.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(removable.status, 200);
  assert.equal((await removable.json()).id, product.id);
});

test('Catalog permissions allow Staff read only and reject missing permission', async () => {
  const staffCookie = await catalogLogin('staff@example.test');
  assert.equal((await fetch(`${base}/products`, { headers: { cookie: staffCookie } })).status, 200);
  assert.equal((await fetch(`${base}/categories`, { headers: { cookie: staffCookie } })).status, 200);
  assert.equal((await fetch(`${base}/categories`, { method: 'POST', headers: { cookie: staffCookie, 'content-type': 'application/json' }, body: JSON.stringify(categoryPayload()) })).status, 403);
  assert.equal((await fetch(`${base}/products`, { method: 'POST', headers: { cookie: staffCookie, 'content-type': 'application/json' }, body: JSON.stringify(productPayload()) })).status, 403);
  const noCatalogPermissionCookie = await catalogLogin('inactive@example.test').catch(() => null);
  assert.equal(noCatalogPermissionCookie, null);
});

test('Inventory read is tenant scoped, low-stock inclusive, and available to Staff', async () => {
  const cookie = await catalogLogin();
  testProducts.find((item) => item.id === ids.product).minStock = 4;
  assert.equal((await fetch(`${base}/inventory`)).status, 401);
  const all = await fetch(`${base}/inventory?storeId=40000000-0000-4000-8000-000000000001`, { headers: { cookie } });
  assert.equal(all.status, 400);
  const list = await fetch(`${base}/inventory`, { headers: { cookie } });
  assert.equal(list.status, 200);
  const body = await list.json();
  assert.equal(body.items.some((item) => item.id === ids.foreignProduct), false);
  assert.equal(body.items.find((item) => item.id === ids.product).lowStock, true);
  const staffCookie = await catalogLogin('staff@example.test');
  const low = await fetch(`${base}/inventory?lowStock=true`, { headers: { cookie: staffCookie } });
  assert.equal(low.status, 200);
  assert.equal((await low.json()).items.some((item) => item.id === ids.product), true);
});

test('Inventory adjustments atomically update stock and append signed history; staff is read-only', async () => {
  const cookie = await catalogLogin();
  const adjustment = (productId, quantity, note) => fetch(`${base}/inventory/adjust`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ productId, quantity, note }) });
  const add = await adjustment(ids.product, 5, '  received  ');
  assert.equal(add.status, 201);
  const added = await add.json();
  assert.equal(added.stockQuantity, 9);
  assert.equal(added.transaction.quantity, 5);
  assert.equal(added.transaction.beforeQuantity, 4);
  assert.equal(added.transaction.afterQuantity, 9);
  assert.equal(added.transaction.note, 'received');
  assert.equal(added.transaction.referenceType, 'ADJUSTMENT');
  const subtract = await adjustment(ids.product, -9, 'empty');
  assert.equal(subtract.status, 201);
  assert.equal((await subtract.json()).stockQuantity, 0);
  assert.equal((await adjustment(ids.product, -1)).status, 409);
  assert.equal((await adjustment(ids.product, 0)).status, 400);
  assert.equal((await adjustment(ids.foreignProduct, 1)).status, 404);
  const concurrent = await Promise.all([adjustment(ids.product, 2), adjustment(ids.product, 3)]);
  assert.deepEqual(concurrent.map((response) => response.status), [201, 201]);
  assert.equal(testProducts.find((item) => item.id === ids.product).stockQuantity, 5);
  const history = await fetch(`${base}/inventory/${ids.product}/history`, { headers: { cookie } });
  assert.equal(history.status, 200);
  const entries = await history.json();
  assert.equal(entries.total, 4);
  assert.equal(entries.items.some((item) => item.afterQuantity === 0), true);
  const foreignHistory = await fetch(`${base}/inventory/${ids.foreignProduct}/history`, { headers: { cookie } });
  assert.equal(foreignHistory.status, 404);
  const staffCookie = await catalogLogin('staff@example.test');
  assert.equal((await fetch(`${base}/inventory`, { headers: { cookie: staffCookie } })).status, 200);
  assert.equal((await fetch(`${base}/inventory/adjust`, { method: 'POST', headers: { cookie: staffCookie, 'content-type': 'application/json' }, body: JSON.stringify({ productId: ids.product, quantity: 2 }) })).status, 403);
});

test('Inventory adjustment rolls back stock if history cannot be written', async () => {
  const cookie = await catalogLogin();
  const product = testProducts.find((item) => item.id === ids.product);
  const before = product.stockQuantity;
  globalThis.__failInventoryTransactionCreate = true;
  const response = await fetch(`${base}/inventory/adjust`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ productId: ids.product, quantity: 4 }) });
  globalThis.__failInventoryTransactionCreate = false;
  assert.equal(response.status, 500);
  assert.equal(testProducts.find((item) => item.id === ids.product).stockQuantity, before);
});

test('Product image upload validates bytes and size, and replacement persists before cleanup', async () => {
  const cookie = await catalogLogin();
  const invalidImage = new FormData();
  invalidImage.set('image', new Blob(['not an image'], { type: 'image/png' }), 'product.png');
  invalidImage.set('categoryId', ids.category); invalidImage.set('sku', 'IMAGE-BAD'); invalidImage.set('name', 'Invalid image');
  invalidImage.set('costPrice', '1'); invalidImage.set('sellingPrice', '2'); invalidImage.set('unit', 'each');
  invalidImage.set('stockQuantity', '0'); invalidImage.set('minStock', '0');
  assert.equal((await fetch(`${base}/products`, { method: 'POST', headers: { cookie }, body: invalidImage })).status, 400);

  const tooLarge = new FormData();
  tooLarge.set('image', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1, 1)], { type: 'image/png' }), 'too-large.png');
  tooLarge.set('categoryId', ids.category); tooLarge.set('sku', 'IMAGE-LARGE'); tooLarge.set('name', 'Large image');
  tooLarge.set('costPrice', '1'); tooLarge.set('sellingPrice', '2'); tooLarge.set('unit', 'each');
  tooLarge.set('stockQuantity', '0'); tooLarge.set('minStock', '0');
  assert.equal((await fetch(`${base}/products`, { method: 'POST', headers: { cookie }, body: tooLarge })).status, 413);

  const product = testProducts.find((row) => row.id === ids.product);
  product.imageUrl = 'https://assets.example.test/product-before.png';
  globalThis.__assetEvents.length = 0;
  const replacement = new FormData();
  replacement.set('image', new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'product.png');
  const updated = await fetch(`${base}/products/${ids.product}`, { method: 'PATCH', headers: { cookie }, body: replacement });
  assert.equal(updated.status, 200);
  assert.match((await updated.json()).imageUrl, /product-/);
  assert.deepEqual(globalThis.__assetEvents.slice(0, 3), ['upload', 'db-update', 'cleanup']);
  const removed = await fetch(`${base}/products/${ids.product}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ removeImage: true }) });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).imageUrl, null);
});
