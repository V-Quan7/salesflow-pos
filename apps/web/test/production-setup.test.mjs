import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { fileURLToPath, URL } from 'node:url';

const helperPath = fileURLToPath(new URL('../lib/setup-form.ts', import.meta.url));
const pagePath = fileURLToPath(new URL('../app/setup/page.tsx', import.meta.url));
const helperSource = fs.readFileSync(helperPath, 'utf8');
const helperCode = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = { exports: {} };
vm.runInNewContext(helperCode, { exports: helper.exports, module: helper });

test('setup form blocks mismatched passwords and allows matching ones', () => {
  assert.equal(helper.exports.passwordConfirmationError('one-long-password', 'different-password'), 'Mật khẩu xác nhận không khớp.');
  assert.equal(helper.exports.passwordConfirmationError('one-long-password', 'one-long-password'), null);
});

test('setup API failures are converted to friendly messages without reflecting request values', () => {
  assert.match(helper.exports.setupRequestError(401), /Setup Token không hợp lệ/);
  assert.match(helper.exports.setupRequestError(409), /đã được khởi tạo/);
  assert.match(helper.exports.setupRequestError(503), /chưa sẵn sàng/);
  assert.doesNotMatch(helper.exports.setupRequestError(401), /secret|token-that-is-not/);
  assert.match(helper.exports.setupRequestError(500), /thử lại sau/);
});

test('setup page includes required Store, Owner and masked token inputs; service errors do not route to setup', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.match(page, /Thông tin cửa hàng/);
  assert.match(page, /Tài khoản Owner/);
  assert.match(page, /type="password" minLength=\{32\} maxLength=\{512\}/);
  assert.match(page, /Xác nhận mật khẩu/);
  assert.match(page, /if \(!result\.setupRequired\) \{ window\.location\.replace\('\/'\); return; \}/);
  assert.match(page, /setServiceUnavailable\(true\)/);
  assert.match(page, /window\.location\.replace\(`\/\?storeCode=/);
  assert.doesNotMatch(page, /localStorage|console\.(log|error)/);
});
