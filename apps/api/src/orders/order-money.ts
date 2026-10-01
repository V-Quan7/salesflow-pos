import { Prisma } from '@prisma/client';

// Prisma money columns allow up to 65 significant digits; keep intermediate calculations exact.
Prisma.Decimal.set({ precision: 100, toExpNeg: -100, toExpPos: 100 });

export type OrderDiscountType = 'FIXED' | 'PERCENTAGE';

export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function calculateDiscountAmount(
  subtotal: Prisma.Decimal,
  discountType: OrderDiscountType,
  discountValue: Prisma.Decimal,
  currency: string,
): Prisma.Decimal {
  if (discountType === 'FIXED') return discountValue;
  if (discountValue.isZero()) return new Prisma.Decimal(0);
  if (discountValue.equals(100)) return subtotal;
  return subtotal.mul(discountValue).mul('0.01').toDecimalPlaces(
    currencyFractionDigits(currency), Prisma.Decimal.ROUND_HALF_UP,
  );
}
