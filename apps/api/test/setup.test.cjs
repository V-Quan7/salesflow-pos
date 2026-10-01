const test = require('node:test');
const assert = require('node:assert/strict');
const argon2 = require('argon2');
const { ALL_PERMISSIONS } = require('../dist/auth/auth.constants');
const { SetupService } = require('../dist/setup/setup.service');
const { SetupDto } = require('../dist/setup/dto/setup.dto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const TOKEN = 'first-run-test-token-that-is-at-least-32-characters';
const originalToken = process.env.INITIAL_SETUP_TOKEN;

function validInput(overrides = {}) {
  return {
    setupToken: TOKEN,
    store: { name: 'Example Shop', code: 'example-shop', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
    owner: { name: 'First Owner', email: 'owner@example.test', password: 'a-safe-test-password-123' },
    ...overrides,
  };
}

function createDatabase({ stores = [], failUser = false, failStatus = false } = {}) {
  let state = { stores: structuredClone(stores), permissions: [], roles: [], rolePermissions: [], users: [], settings: [] };
  let lockTail = Promise.resolve();
  let nextId = 1;
  const id = () => `id-${nextId++}`;
  const database = {
    store: { count: async () => { if (failStatus) throw new Error('database unavailable'); return state.stores.length; } },
    $transaction: async (callback) => {
      let release;
      let snapshot;
      const tx = {
        $queryRaw: async (strings) => {
          assert.match(strings.join(''), /pg_advisory_xact_lock/);
          assert.match(strings.join(''), /IS NULL AS locked/);
          const previous = lockTail;
          lockTail = new Promise((resolve) => { release = resolve; });
          await previous;
          snapshot = structuredClone(state);
          return [];
        },
        store: {
          count: async () => state.stores.length,
          create: async ({ data }) => {
            if (state.stores.some((row) => row.code === data.code)) throw Object.assign(new Error('unique'), { code: 'P2002' });
            const row = { id: id(), ...data };
            state.stores.push(row);
            return row;
          },
        },
        permission: {
          upsert: async ({ where, update, create }) => {
            let row = state.permissions.find((item) => item.code === where.code);
            if (row) Object.assign(row, update);
            else { row = { id: id(), ...create }; state.permissions.push(row); }
            return { id: row.id };
          },
        },
        role: {
          create: async ({ data }) => {
            const row = { id: id(), ...data };
            state.roles.push(row);
            return { id: row.id };
          },
        },
        rolePermission: {
          createMany: async ({ data }) => { state.rolePermissions.push(...structuredClone(data)); return { count: data.length }; },
        },
        user: {
          create: async ({ data }) => {
            if (failUser) throw new Error('simulated owner insert failure');
            const row = { id: id(), ...data };
            state.users.push(row);
            return row;
          },
        },
        storeSetting: {
          createMany: async ({ data }) => { state.settings.push(...structuredClone(data)); return { count: data.length }; },
        },
      };
      try { return await callback(tx); }
      catch (error) { if (snapshot) state = snapshot; throw error; }
      finally { release?.(); }
    },
  };
  return { database, read: () => state };
}

function getStatus(error) { return error && typeof error.getStatus === 'function' ? error.getStatus() : undefined; }

test.beforeEach(() => { process.env.INITIAL_SETUP_TOKEN = TOKEN; });
test.after(() => {
  if (originalToken === undefined) delete process.env.INITIAL_SETUP_TOKEN;
  else process.env.INITIAL_SETUP_TOKEN = originalToken;
});

test('empty database status requests first-run setup', async () => {
  const { database } = createDatabase();
  assert.deepEqual(await new SetupService(database).getStatus(), { setupRequired: true });
});

test('setup DTO validates nested required fields and rejects client-selected Store scope', async () => {
  const input = validInput({ storeId: 'client-selected-store' });
  input.store = { ...input.store, currency: 'vnd' };
  const dto = plainToInstance(SetupDto, input);
  assert.equal(dto.store.name, 'Example Shop');
  assert.equal(dto.store.currency, 'VND');
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  assert.ok(errors.some((error) => error.property === 'storeId'));

  const incomplete = plainToInstance(SetupDto, { setupToken: TOKEN, store: {}, owner: { password: 'short' } });
  const invalidFields = await validate(incomplete);
  assert.ok(invalidFields.length > 0);
});

test('any existing Store disables public setup, including Store without an Owner', async () => {
  const { database } = createDatabase({ stores: [{ id: 'existing-store', code: 'existing' }] });
  const service = new SetupService(database);
  assert.deepEqual(await service.getStatus(), { setupRequired: false });
  await assert.rejects(service.create(validInput()), (error) => getStatus(error) === 409);
});

test('database status failures propagate instead of being treated as an empty database', async () => {
  const { database } = createDatabase({ failStatus: true });
  await assert.rejects(new SetupService(database).getStatus(), /database unavailable/);
});

test('invalid setup token is rejected without creating data', async () => {
  const { database, read } = createDatabase();
  await assert.rejects(new SetupService(database).create(validInput({ setupToken: 'x'.repeat(40) })), (error) => getStatus(error) === 401);
  assert.equal(read().stores.length, 0);
});

test('valid setup creates Store, scoped roles, current permissions, settings and an Argon2id Owner atomically', async () => {
  const { database, read } = createDatabase();
  const result = await new SetupService(database).create(validInput());
  const state = read();
  assert.deepEqual(result, { store: { name: 'Example Shop', code: 'example-shop' }, owner: { name: 'First Owner', email: 'owner@example.test' } });
  assert.equal(state.stores.length, 1);
  assert.deepEqual(state.roles.map(({ name }) => name).sort(), ['ADMIN', 'OWNER', 'STAFF']);
  assert.equal(state.roles.every((role) => role.storeId === state.stores[0].id), true);
  assert.deepEqual(new Set(state.permissions.map(({ code }) => code)), new Set(ALL_PERMISSIONS.map(([code]) => code)));
  const ownerRole = state.roles.find(({ name }) => name === 'OWNER');
  const owner = state.users[0];
  assert.equal(owner.storeId, state.stores[0].id);
  assert.equal(owner.roleId, ownerRole.id);
  assert.equal(owner.status, 'ACTIVE');
  assert.equal(await argon2.verify(owner.passwordHash, 'a-safe-test-password-123'), true);
  assert.match(owner.passwordHash, /^\$argon2id\$/);

  const grants = (roleName) => {
    const role = state.roles.find(({ name }) => name === roleName);
    const permissionIds = new Set(state.rolePermissions.filter(({ roleId }) => roleId === role.id).map(({ permissionId }) => permissionId));
    return new Set(state.permissions.filter(({ id: permissionId }) => permissionIds.has(permissionId)).map(({ code }) => code));
  };
  assert.deepEqual(grants('OWNER'), new Set(ALL_PERMISSIONS.map(([code]) => code)));
  assert.equal(grants('ADMIN').has('users:delete'), false);
  assert.equal(grants('ADMIN').has('products:create'), true);
  assert.equal(grants('ADMIN').has('customers:update'), true);
  assert.deepEqual(grants('STAFF'), new Set(['auth:me', 'products:read', 'categories:read', 'inventory:read', 'customers:read', 'orders:create', 'orders:read']));
  assert.deepEqual(state.settings.map(({ key, value }) => [key, value]), [
    ['store.displayNameShort', 'Example Shop'], ['store.browserTitle', 'Example Shop'], ['store.operatingHours', ''],
  ]);
  assert.equal(state.stores.some(({ name }) => name === 'Development Store'), false);
  assert.deepEqual(await new SetupService(database).getStatus(), { setupRequired: false });
});

test('Owner insertion failure rolls back Store, permissions, roles and settings', async () => {
  const { database, read } = createDatabase({ failUser: true });
  await assert.rejects(new SetupService(database).create(validInput()), /simulated owner insert failure/);
  assert.deepEqual(read(), { stores: [], permissions: [], roles: [], rolePermissions: [], users: [], settings: [] });
});

test('repeated setup is rejected with 409 after initialization', async () => {
  const { database } = createDatabase();
  const service = new SetupService(database);
  await service.create(validInput());
  await assert.rejects(service.create(validInput()), (error) => getStatus(error) === 409);
});

test('concurrent first-run requests serialize and exactly one succeeds', async () => {
  const { database, read } = createDatabase();
  const service = new SetupService(database);
  const outcomes = await Promise.allSettled([service.create(validInput()), service.create(validInput({ owner: { ...validInput().owner, email: 'second@example.test' } }))]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejection = outcomes.find(({ status }) => status === 'rejected');
  assert.equal(getStatus(rejection.reason), 409);
  assert.equal(read().stores.length, 1);
  assert.equal(read().users.length, 1);
});

test('missing setup token configuration fails closed before writing Store data', async () => {
  delete process.env.INITIAL_SETUP_TOKEN;
  const { database, read } = createDatabase();
  await assert.rejects(new SetupService(database).create(validInput()), (error) => getStatus(error) === 503);
  assert.equal(read().stores.length, 0);
});
