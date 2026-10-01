function parts(value: string): [bigint, number] {
  const [whole, fraction = ''] = value.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  return [BigInt(digits || '0'), fraction.length];
}

function scaled(value: string, scale: number) {
  const [digits, ownScale] = parts(value);
  return digits * (BigInt(10) ** BigInt(scale - ownScale));
}

function decimal(value: bigint, scale: number) {
  if (!scale) return value.toString();
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`;
}

export function add(values: string[]) {
  const scale = Math.max(0, ...values.map((value) => parts(value)[1]));
  return decimal(values.reduce((sum, value) => sum + scaled(value, scale), BigInt(0)), scale);
}

export function multiply(value: string, quantity: number) {
  const [digits, scale] = parts(value);
  return decimal(digits * BigInt(quantity), scale);
}

export function subtract(left: string, right: string) {
  const scale = Math.max(parts(left)[1], parts(right)[1]);
  return decimal(scaled(left, scale) - scaled(right, scale), scale);
}

export function compare(left: string, right: string) {
  const scale = Math.max(parts(left)[1], parts(right)[1]);
  const a = scaled(left, scale);
  const b = scaled(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isNonNegativeDecimal(value: string) {
  return /^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/.test(value);
}

export function currencyFractionDigits(currency: string | null) {
  try {
    return currency ? (new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2) : 2;
  } catch {
    return 2;
  }
}

export function percentageDiscount(subtotal: string, percentage: string, currency: string | null) {
  if (percentage === '0' || subtotal === '0') return '0';
  if (percentage === '100') return subtotal;
  const [subtotalDigits, subtotalScale] = parts(subtotal);
  const [percentageDigits, percentageScale] = parts(percentage);
  const rawDigits = subtotalDigits * percentageDigits;
  const rawScale = subtotalScale + percentageScale + 2;
  const targetScale = currencyFractionDigits(currency);
  if (rawScale <= targetScale) return decimal(rawDigits * (BigInt(10) ** BigInt(targetScale - rawScale)), targetScale);
  const divisor = BigInt(10) ** BigInt(rawScale - targetScale);
  const quotient = rawDigits / divisor;
  const remainder = rawDigits % divisor;
  const rounded = remainder * BigInt(2) >= divisor ? quotient + BigInt(1) : quotient;
  return decimal(rounded, targetScale);
}

export function displayMoney(value: string, currency: string | null, locale = 'vi-VN') {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, currency
      ? { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  } catch {
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  const formattedParts = formatter.formatToParts(BigInt(`${negative ? '-' : ''}${integer || '0'}`));
  if (!fraction) return formattedParts.map((part) => part.value).join('');
  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value || '.';
  let inserted = false;
  return formattedParts.map((part, index) => {
    const result = part.value;
    const lastIntegerPart = index === formattedParts.length - 1 || !['integer', 'group'].includes(formattedParts[index + 1].type);
    if (!inserted && ['integer', 'group'].includes(part.type) && lastIntegerPart) {
      inserted = true;
      return `${result}${decimalSeparator}${fraction}`;
    }
    return result;
  }).join('');
}
