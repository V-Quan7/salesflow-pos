export type ThermalReceiptSource = {
  orderCode: string;
  subtotal: string;
  discount: string;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: string;
  total: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET';
  createdAt: string;
  customer: { name: string } | null;
  staff: { name: string };
  store: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
    timezone: string;
    locale: string;
  };
  items: { productNameSnapshot: string; skuSnapshot: string; quantity: number; unitPrice: string; total: string }[];
};

const paymentLabels: Record<ThermalReceiptSource['paymentMethod'], string> = {
  CASH: 'Tiền mặt',
  CARD: 'Thẻ',
  BANK_TRANSFER: 'Chuyển khoản',
  E_WALLET: 'Ví điện tử',
};

export function formatReceiptDate(value: string, timezone: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const field = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${field('day')}/${field('month')}/${field('year')} ${field('hour')}:${field('minute')}`;
}

export function createThermalReceiptModel(order: ThermalReceiptSource) {
  return {
    orderCode: order.orderCode,
    date: formatReceiptDate(order.createdAt, order.store.timezone),
    cashier: order.staff.name,
    customer: order.customer?.name ?? 'Khách lẻ',
    store: {
      name: order.store.name,
      logoUrl: order.store.logoUrl,
      address: order.store.address,
      phone: order.store.phone,
      currency: order.store.currency,
      locale: order.store.locale,
    },
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: order.subtotal,
    discount: order.discount,
    discountLabel: order.discountType === 'PERCENTAGE' ? `Giảm giá (${order.discountValue}%)` : 'Giảm giá cố định',
    total: order.total,
    paymentMethod: paymentLabels[order.paymentMethod],
  };
}
