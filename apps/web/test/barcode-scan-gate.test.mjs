import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';

const gatePath = new (await import('node:url')).URL('../lib/barcode-scan-gate.ts', import.meta.url);
const source = fs.readFileSync(gatePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module, Date, JSON, Map, Math });
const { createBarcodeScanGate, includeScannedBarcode } = module.exports;

const sample = (code, format = 'code_128') => ({ code, format });

test('confirms the same code and format after three matching results in the five-frame window', () => {
  const gate = createBarcodeScanGate();
  assert.equal(gate.observe(sample('SF-TEST-0001'), 0).confirmed, null);
  assert.equal(gate.observe(sample('SF-TEST-0001'), 125).confirmed, null);

  const result = gate.observe(sample('SF-TEST-0001'), 250);
  assert.deepEqual(JSON.parse(JSON.stringify(result.confirmed)), { code: 'SF-TEST-0001', format: 'code_128' });
  assert.equal(result.matchCount, 3);
  assert.equal(result.locked, true);
});

test('different noisy codes do not confirm or produce a candidate lookup', () => {
  const gate = createBarcodeScanGate();
  const results = ['A', 'B', 'C'].map((code, index) => gate.observe(sample(code), index * 125));
  assert.equal(results.some((result) => result.confirmed !== null), false);
  assert.equal(results.at(-1).matchCount, 1);
});

test('A, A, B, A, A reaches the designed three-of-five threshold only once', () => {
  const gate = createBarcodeScanGate();
  const results = ['A', 'A', 'B', 'A', 'A'].map((code, index) => gate.observe(sample(code), index * 125));
  assert.equal(results.filter((result) => result.confirmed !== null).length, 1);
  assert.equal(results[3].confirmed.code, 'A');
  assert.equal(results[4].confirmed, null);
});

test('the same code cannot trigger another lookup while the gate is locked', () => {
  const gate = createBarcodeScanGate({ cooldownMs: 0 });
  const first = [0, 125, 250].map((now) => gate.observe(sample('8931234567890', 'ean_13'), now));
  const repeated = Array.from({ length: 8 }, (_, index) => gate.observe(sample('8931234567890', 'ean_13'), 375 + index * 125));
  assert.equal(first.filter((result) => result.confirmed !== null).length, 1);
  assert.equal(repeated.filter((result) => result.confirmed !== null).length, 0);
});

test('a different format does not count as a matching frame for the same code', () => {
  const gate = createBarcodeScanGate();
  gate.observe(sample('12345678', 'ean_8'), 0);
  gate.observe(sample('12345678', 'upc_a'), 125);
  const result = gate.observe(sample('12345678', 'ean_8'), 250);
  assert.equal(result.confirmed, null);
  assert.equal(result.matchCount, 2);
});

test('gate can rearm only after barcode absence and cooldown, then confirms a later scan', () => {
  const gate = createBarcodeScanGate({ absenceMs: 700, cooldownMs: 1200 });
  [0, 125, 250].forEach((now) => gate.observe(sample('ABC123'), now));

  gate.observe(null, 300);
  gate.observe(null, 999);
  assert.equal(gate.observe(null, 1000).locked, true);
  assert.equal(gate.observe(null, 1450).locked, false);

  gate.observe(sample('ABC123'), 1500);
  gate.observe(sample('ABC123'), 1625);
  const secondConfirmation = gate.observe(sample('ABC123'), 1750);
  assert.equal(secondConfirmation.confirmed.code, 'ABC123');
});

test('trims outer whitespace but preserves every barcode character inside', () => {
  const gate = createBarcodeScanGate();
  gate.observe(sample('  1W<5@.7{;  '), 0);
  gate.observe(sample('1W<5@.7{;'), 1);
  const result = gate.observe(sample('1W<5@.7{;'), 2);
  assert.equal(result.confirmed.code, '1W<5@.7{;');
});

test('preserves a barcode leading zero through camera confirmation', () => {
  const gate = createBarcodeScanGate();
  gate.observe(sample('0001234567890', 'ean_13'), 0);
  gate.observe(sample('0001234567890', 'ean_13'), 125);
  assert.equal(gate.observe(sample('0001234567890', 'ean_13'), 250).confirmed.code, '0001234567890');
});

test('404 feedback can show the exact camera-confirmed barcode', () => {
  assert.equal(
    includeScannedBarcode('Không tìm thấy sản phẩm với mã vạch này.', '0865L$47{;'),
    'Không tìm thấy sản phẩm với mã vạch này.\nMã camera đã đọc: 0865L$47{;',
  );
});
