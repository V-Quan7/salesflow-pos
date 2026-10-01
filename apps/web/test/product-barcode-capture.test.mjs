import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

const source = fs.readFileSync(new URL('../lib/product-barcode-capture.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module });
const { captureBarcodeForProductForm } = module.exports;

test('captured barcode is copied exactly into the form and closes scanner without saving', () => {
  const calls = [];
  const feedback = captureBarcodeForProductForm('0001234567890', (value) => calls.push(['update', value]), () => calls.push(['close']));
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['update', '0001234567890'], ['close']]);
  assert.equal(feedback.kind, 'success');
});
