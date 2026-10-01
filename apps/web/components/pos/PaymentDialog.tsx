'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import { compare, displayMoney, isNonNegativeDecimal, subtract } from '../../lib/pos-money';

export type PosPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET';
export type PaymentConfirmation = {
  paymentMethod: PosPaymentMethod;
  amountReceived?: string;
  manualPaymentConfirmed?: boolean;
};

const methods: { value: PosPaymentMethod; label: string; icon: IconName }[] = [
  { value: 'CASH', label: 'Tiền mặt', icon: 'receipt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản', icon: 'info' },
  { value: 'CARD', label: 'Thẻ', icon: 'store' },
  { value: 'E_WALLET', label: 'Ví điện tử', icon: 'check' },
];

export function PaymentDialog({ open, total, currency, locale, saving, onClose, onConfirm }: {
  open: boolean;
  total: string;
  currency: string | null;
  locale?: string;
  saving: boolean;
  onClose: () => void;
  onConfirm: (payment: PaymentConfirmation) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [amountReceived, setAmountReceived] = useState('');
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const normalizedCashAmount = amountReceived.trim();
  const hasCashAmount = normalizedCashAmount !== '';
  const cashAmountValid = !hasCashAmount || isNonNegativeDecimal(normalizedCashAmount);
  const cashIsShort = hasCashAmount && cashAmountValid && compare(normalizedCashAmount, total) < 0;
  const cashCanConfirm = !hasCashAmount || (cashAmountValid && !cashIsShort);
  const isCash = paymentMethod === 'CASH';
  const paymentLabel = methods.find((method) => method.value === paymentMethod)?.label ?? paymentMethod;

  useEffect(() => {
    if (open) {
      setPaymentMethod('CASH');
      setAmountReceived('');
      setManualConfirmed(false);
    }
  }, [open]);

  function selectMethod(method: PosPaymentMethod) {
    setPaymentMethod(method);
    setManualConfirmed(false);
    setAmountReceived('');
  }

  function confirm() {
    if (saving) return;
    if (isCash) {
      if (!cashCanConfirm) return;
      onConfirm({ paymentMethod, ...(hasCashAmount ? { amountReceived: normalizedCashAmount } : {}) });
      return;
    }
    if (!manualConfirmed) return;
    onConfirm({ paymentMethod, manualPaymentConfirmed: true });
  }

  return <Dialog open={open} onClose={onClose} onCancel={(event) => { if (saving) event.preventDefault(); }}
    title="Thanh toán" description="Kiểm tra số tiền và phương thức trước khi xác nhận."
    footer={<><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Hủy</button>
      <button type="button" disabled={saving || (isCash ? !cashCanConfirm : !manualConfirmed)} onClick={confirm}>
        {saving ? 'Đang xử lý…' : 'Xác nhận thanh toán'}
      </button></>}>
    <div className="payment-dialog-content">
      <section className="payment-total-panel" aria-label="Tổng tiền phải thanh toán">
        <span>Tổng thanh toán</span><strong>{displayMoney(total, currency, locale)}</strong>
      </section>
      <fieldset className="payment-method-fieldset">
        <legend>Phương thức thanh toán</legend>
        <div className="payment-method-grid">
          {methods.map((method) => <button type="button" key={method.value}
            className={`payment-method-option${paymentMethod === method.value ? ' is-selected' : ''}`}
            aria-pressed={paymentMethod === method.value} disabled={saving} onClick={() => selectMethod(method.value)}>
            <Icon name={method.icon} size={18} /><span>{method.label}</span>
          </button>)}
        </div>
      </fieldset>
      {isCash ? <div className="payment-cash-fields">
        <label>Tiền khách đưa
          <input type="text" inputMode="decimal" autoFocus value={amountReceived}
            aria-invalid={amountReceived !== '' && (!cashAmountValid || cashIsShort)}
            aria-describedby="cash-payment-feedback"
            onChange={(event) => setAmountReceived(event.target.value)} placeholder="Nhập số tiền nhận" />
        </label>
        <dl className="payment-change-summary">
          <div><dt>Tiền thừa</dt><dd>{!hasCashAmount ? '—' : cashCanConfirm ? displayMoney(subtract(normalizedCashAmount, total), currency, locale) : displayMoney('0', currency, locale)}</dd></div>
        </dl>
        <div id="cash-payment-feedback" aria-live="polite">
          {cashIsShort && <p role="alert" className="notice-warning">Còn thiếu {displayMoney(subtract(total, normalizedCashAmount), currency, locale)}.</p>}
          {hasCashAmount && !cashAmountValid && <p role="alert" className="notice-error">Nhập một số tiền hợp lệ, không âm.</p>}
        </div>
      </div> : <div className="manual-payment-confirmation">
        <p>{paymentMethod === 'BANK_TRANSFER'
          ? 'Hãy kiểm tra giao dịch trong ứng dụng ngân hàng. SalesFlow không kết nối hoặc xác minh ngân hàng.'
          : paymentMethod === 'CARD'
            ? 'Hãy kiểm tra giao dịch trên thiết bị thẻ. SalesFlow không kết nối hoặc xác minh máy POS.'
            : 'Hãy kiểm tra giao dịch trong ứng dụng ví. SalesFlow không kết nối hoặc xác minh ví điện tử.'}</p>
        <label className="manual-payment-check">
          <input type="checkbox" checked={manualConfirmed} disabled={saving} onChange={(event) => setManualConfirmed(event.target.checked)} />
          <span>Tôi đã kiểm tra thanh toán {paymentLabel.toLowerCase()} bên ngoài hệ thống.</span>
        </label>
      </div>}
    </div>
  </Dialog>;
}
