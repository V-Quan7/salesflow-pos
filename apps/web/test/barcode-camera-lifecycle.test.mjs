import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

const source = fs.readFileSync(new URL('../lib/barcode-scanner-lifecycle.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module, Promise });
const { cleanupBarcodeScanner } = module.exports;

test('scanner close detaches the processed callback and stops the active camera', async () => {
  const calls = [];
  const listener = () => {};
  const scanner = {
    offProcessed: (candidate) => calls.push(['off', candidate]),
    stop: () => { calls.push(['stop']); return Promise.resolve(); },
  };
  cleanupBarcodeScanner(scanner, listener, true);
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'off');
  assert.equal(calls[0][1], listener);
  assert.equal(calls[1][0], 'stop');
});

test('scanner cleanup also stops initialization when no frame listener was attached', () => {
  const calls = [];
  const scanner = { offProcessed: () => calls.push('off'), stop: () => { calls.push('stop'); } };
  cleanupBarcodeScanner(scanner, () => {}, false);
  assert.deepEqual(calls, ['stop']);
});
