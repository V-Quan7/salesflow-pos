import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';

const helperPath = new globalThis.URL('../lib/user-management.ts', import.meta.url);
const source = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = { exports: {} };
vm.runInNewContext(compiled, { exports: helper.exports, module: helper, Object, Array, Map, Number, String });
const assertJsonEqual = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

const roles = [
  { id: 'r-owner', storeId: 'store-a', name: 'OWNER', permissions: [{ permission: { code: 'users:read', description: 'Read users' } }, { permission: { code: 'users:delete', description: 'Deactivate users' } }] },
  { id: 'r-admin', storeId: 'store-a', name: 'ADMIN', permissions: [{ permission: { code: 'users:read', description: 'Read users' } }] },
  { id: 'r-staff', storeId: 'store-a', name: 'STAFF', permissions: [{ permission: { code: 'products:read', description: 'Read products' } }] },
  { id: 'r-global', storeId: null, name: 'GLOBAL', permissions: [{ permission: { code: 'users:read', description: 'Read users' } }] },
  { id: 'r-foreign', storeId: 'store-b', name: 'OTHER', permissions: [{ permission: { code: 'users:read', description: 'Read users' } }] },
];

test('permission checks and role options use runtime permissions and current Store', () => {
  const allowed = helper.exports.assignableRoles(roles, 'store-a', ['users:read', 'products:read']);
  assert.deepEqual(allowed.map(({ id }) => id), ['r-admin', 'r-staff']);
  assert.equal(helper.exports.hasPermission(['users:read'], 'users:read'), true);
  assert.equal(helper.exports.hasPermission(['users:read'], 'users:delete'), false);
});

test('user actions respect permissions and prevent self-deactivation in the UI', () => {
  const actor = { id: 'owner-1' };
  const activeOther = { id: 'staff-1', status: 'ACTIVE' };
  const inactiveOther = { id: 'staff-2', status: 'INACTIVE' };
  assert.equal(JSON.stringify(helper.exports.userActions(actor, activeOther, ['users:update'])), JSON.stringify({
    canEdit: true, canActivate: false, canDeactivate: false,
  }));
  assert.equal(JSON.stringify(helper.exports.userActions(actor, activeOther, ['users:delete'])), JSON.stringify({
    canEdit: false, canActivate: false, canDeactivate: true,
  }));
  assert.equal(helper.exports.userActions(actor, { id: actor.id, status: 'ACTIVE' }, ['users:delete']).canDeactivate, false);
  assert.equal(helper.exports.userActions(actor, inactiveOther, ['users:update']).canActivate, true);
});

test('permission preview groups only permission records supplied by the API', () => {
  const permissions = [
    { id: 'p2', code: 'orders:read', description: 'Read orders' },
    { id: 'p1', code: 'users:read', description: 'Read users' },
  ];
  const groups = helper.exports.groupPermissions(permissions);
  assert.equal(JSON.stringify(groups), JSON.stringify([
    { name: 'orders', items: [permissions[0]] },
    { name: 'users', items: [permissions[1]] },
  ]));
});

test('Store detail check, initials and API error states are safe and predictable', () => {
  assert.equal(helper.exports.isTargetInCurrentStore({ storeId: 'store-a' }, 'store-a'), true);
  assert.equal(helper.exports.isTargetInCurrentStore({ storeId: 'store-b' }, 'store-a'), false);
  assert.equal(helper.exports.initials('Nguyễn Văn An'), 'NA');
  assert.equal(helper.exports.initials('Staff'), 'S');
  assert.equal(helper.exports.userApiError({ status: 401 }), 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  assert.equal(helper.exports.userApiError({ status: 403 }), 'Bạn không có quyền thực hiện thao tác này.');
  assert.equal(helper.exports.userApiError({ status: 404 }), 'Người dùng không còn tồn tại hoặc không thuộc cửa hàng này.');
  assert.equal(helper.exports.userApiError({ status: 409 }), 'Email này đã được sử dụng trong cửa hàng.');
  assert.match(helper.exports.userApiError({ status: 400 }), /chưa hợp lệ/);
  assert.match(helper.exports.userApiError({ status: 422 }), /chưa hợp lệ/);
  assert.match(helper.exports.userApiError({ status: 500 }), /Máy chủ/);
  assert.doesNotMatch(helper.exports.userApiError({ status: 500, stack: 'secret stack trace' }), /secret/);
});

test('user API query contains only supported filters and omits blank values', () => {
  assertJsonEqual(helper.exports.buildUsersQuery(2, 20, '', ''), { page: 2, limit: 20 });
  assertJsonEqual(helper.exports.buildUsersQuery(1, 20, '  an  ', 'ACTIVE'), {
    page: 1, limit: 20, search: '  an  ', status: 'ACTIVE',
  });
});

test('create and update payloads normalize fields and never include store or update password', () => {
  const created = helper.exports.buildCreateUserInput({ name: '  An  ', email: ' an@example.test ', password: 'initial-password', roleId: 'role-1' });
  assertJsonEqual(created, { name: 'An', email: 'an@example.test', password: 'initial-password', roleId: 'role-1' });
  assert.equal(Object.hasOwn(created, 'storeId'), false);

  const unchangedRole = helper.exports.buildUpdateUserInput({ name: '  An  ', email: ' an@example.test ', roleId: 'role-1' }, 'role-1');
  assertJsonEqual(unchangedRole, { name: 'An', email: 'an@example.test' });
  const changedRole = helper.exports.buildUpdateUserInput({ name: 'An', email: 'an@example.test', roleId: 'role-2' }, 'role-1');
  assertJsonEqual(changedRole, { name: 'An', email: 'an@example.test', roleId: 'role-2' });
  assert.equal(Object.hasOwn(changedRole, 'password'), false);
  assert.equal(Object.hasOwn(changedRole, 'storeId'), false);
});

test('user list state distinguishes loading, errors, no matches, empty and results', () => {
  const user = { id: 'staff-1' };
  assert.equal(helper.exports.userListState(true, 'error', [], '', ''), 'loading');
  assert.equal(helper.exports.userListState(false, 'error', [], '', ''), 'error');
  assert.equal(helper.exports.userListState(false, '', [], 'an', ''), 'empty-search');
  assert.equal(helper.exports.userListState(false, '', [], '', ''), 'empty');
  assert.equal(helper.exports.userListState(false, '', [user], '', ''), 'results');
});
