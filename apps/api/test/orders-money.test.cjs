const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { calculateDiscountAmount, currencyFractionDigits } = require('../dist/orders/order-money');

test('currency precision follows the Store currency', () => {
  assert.equal(currencyFractionDigits('VND'), 0);
  assert.equal(currencyFractionDigits('USD'), 2);
  assert.equal(currencyFractionDigits('KWD'), 3);
});

test('percentage discount rounds HALF-UP at the currency minor unit', () => {
  assert.equal(calculateDiscountAmount(new Prisma.Decimal('50'), 'PERCENTAGE', new Prisma.Decimal('1'), 'VND').toString(), '1');
  assert.equal(calculateDiscountAmount(new Prisma.Decimal('100.5'), 'PERCENTAGE', new Prisma.Decimal('1'), 'USD').toString(), '1.01');
  assert.equal(calculateDiscountAmount(new Prisma.Decimal('100.5'), 'PERCENTAGE', new Prisma.Decimal('1'), 'KWD').toString(), '1.005');
});

test('fixed discount is exact, 0 percent is zero, and 100 percent equals subtotal', () => {
  assert.equal(calculateDiscountAmount(new Prisma.Decimal('10.25'), 'FIXED', new Prisma.Decimal('1.25'), 'VND').toString(), '1.25');
  assert.equal(calculateDiscountAmount(new Prisma.Decimal('10.25'), 'PERCENTAGE', new Prisma.Decimal('0'), 'VND').toString(), '0');
  assert.equal(calculateDiscountAmount(new Prisma.Decimal('10.25'), 'PERCENTAGE', new Prisma.Decimal('100'), 'VND').toString(), '10.25');
});

test('percentage multiplication remains exact for large Decimal values', () => {
  const subtotal = new Prisma.Decimal('123456789012345678901234567890');
  assert.equal(calculateDiscountAmount(subtotal, 'PERCENTAGE', new Prisma.Decimal('10'), 'VND').toString(), '12345678901234567890123456789');
});
