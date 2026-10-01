'use client';

import Image from 'next/image';
import { displayMoney } from '../../lib/pos-money';
import { createThermalReceiptModel, type ThermalReceiptSource } from '../../lib/thermal-receipt-model';

export function ThermalReceipt({ order }: { order: ThermalReceiptSource }) {
  const receipt = createThermalReceiptModel(order);
  const money = (value: string) => displayMoney(value, receipt.store.currency, receipt.store.locale);

  return <article className="thermal-receipt" aria-label={`Hóa đơn ${receipt.orderCode}`}>
    <header className="thermal-receipt-header">
      {receipt.store.logoUrl && <Image className="thermal-receipt-logo" src={receipt.store.logoUrl} alt={receipt.store.name}
        width={180} height={72} unoptimized loading="eager" />}
      <span className="thermal-receipt-brand">SALESFLOW</span>
      <h1>{receipt.store.name}</h1>
      {receipt.store.address && <p>{receipt.store.address}</p>}
      {receipt.store.phone && <p>Điện thoại: {receipt.store.phone}</p>}
    </header>

    <div className="thermal-receipt-rule" />
    <h2 className="thermal-receipt-title">HÓA ĐƠN BÁN HÀNG</h2>
    <dl className="thermal-receipt-meta">
      <div><dt>Mã đơn</dt><dd>{receipt.orderCode}</dd></div>
      <div><dt>Ngày</dt><dd>{receipt.date}</dd></div>
      <div><dt>Thu ngân</dt><dd>{receipt.cashier}</dd></div>
      <div><dt>Khách hàng</dt><dd>{receipt.customer}</dd></div>
    </dl>
    <div className="thermal-receipt-rule" />

    <section className="thermal-receipt-items" aria-label="Sản phẩm">
      {receipt.items.map((item, index) => <article className="thermal-receipt-item" key={`${item.sku}-${index}`}>
        <strong className="thermal-receipt-product-name">{item.name}</strong>
        <code>{item.sku}</code>
        <div className="thermal-receipt-item-pricing"><span>{item.quantity} × {money(item.unitPrice)}</span><strong>{money(item.total)}</strong></div>
      </article>)}
    </section>
    <div className="thermal-receipt-rule" />
    <dl className="thermal-receipt-totals">
      <div><dt>Tạm tính</dt><dd>{money(receipt.subtotal)}</dd></div>
      <div><dt>{receipt.discountLabel}</dt><dd>−{money(receipt.discount)}</dd></div>
      <div className="thermal-receipt-grand-total"><dt>TỔNG THANH TOÁN</dt><dd>{money(receipt.total)}</dd></div>
      <div><dt>Phương thức</dt><dd>{receipt.paymentMethod}</dd></div>
    </dl>
    <div className="thermal-receipt-rule" />
    <p className="thermal-receipt-count">Số lượng mặt hàng: {receipt.itemQuantity}</p>
    <footer className="thermal-receipt-footer"><strong>Cảm ơn quý khách!</strong><span>Hẹn gặp lại!</span></footer>
  </article>;
}
