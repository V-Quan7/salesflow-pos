import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

function loadTypeScript(relativePath) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module });
  return module.exports;
}

const money = loadTypeScript('../lib/pos-money.ts');
const receipt = loadTypeScript('../lib/thermal-receipt-model.ts');

test('POS money preview uses exact decimal math and HALF-UP currency precision', () => {
  assert.equal(money.add(['0.1', '0.2']), '0.3');
  assert.equal(money.multiply('399000', 2), '798000');
  assert.equal(money.percentageDiscount('50', '1', 'VND'), '1');
  assert.equal(money.percentageDiscount('100.5', '1', 'USD'), '1.01');
  assert.equal(money.percentageDiscount('100.5', '1', 'KWD'), '1.005');
  assert.equal(money.displayMoney('1234.50', 'USD', 'en-US'), '$1,234.50');
});

test('thermal receipt uses Store timezone and snapshots, omitting tender, change, cost, and secret fields', () => {
  const order = {
    orderCode: 'ORD-0012', subtotal: '399000', discount: '39900', discountType: 'PERCENTAGE', discountValue: '10', total: '359100',
    paymentMethod: 'CASH', createdAt: '2025-06-24T07:32:00.000Z', customer: { name: 'Khách lẻ' }, staff: { name: 'Thu ngân' },
    store: { name: 'Cửa hàng thử nghiệm', logoUrl: null, address: 'Địa chỉ thử nghiệm', phone: '0123456789', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' },
    items: [{ productNameSnapshot: 'Áo dài tên sản phẩm thử nghiệm', skuSnapshot: 'SKU-001', quantity: 1, unitPrice: '399000', total: '399000', costPrice: '8888.88' }],
    amountReceived: '777777', changeAmount: '418677', internalSecret: 'do-not-print',
  };
  const model = receipt.createThermalReceiptModel(order);
  assert.equal(model.date, '24/06/2025 14:32');
  assert.equal(model.discountLabel, 'Giảm giá (10%)');
  assert.equal(model.paymentMethod, 'Tiền mặt');
  assert.equal(model.store.name, 'Cửa hàng thử nghiệm'); assert.equal(model.store.address, 'Địa chỉ thử nghiệm');
  assert.equal(model.store.phone, '0123456789'); assert.equal(model.cashier, 'Thu ngân'); assert.equal(model.customer, 'Khách lẻ');
  assert.equal(model.items[0].sku, 'SKU-001');
  assert.equal(model.items[0].name, 'Áo dài tên sản phẩm thử nghiệm'); assert.equal(model.items[0].unitPrice, '399000');
  assert.equal(model.items[0].total, '399000'); assert.equal(model.subtotal, '399000'); assert.equal(model.total, '359100');
  assert.equal(model.itemQuantity, 1);
  const output = JSON.stringify(model);
  for (const forbidden of ['amountReceived', 'changeAmount', 'costPrice', '777777', '418677', '8888.88', 'do-not-print']) {
    assert.equal(output.includes(forbidden), false, `receipt output must not include ${forbidden}`);
  }
});
