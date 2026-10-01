'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { cancelOrder, currentUser, getOrder, getOrders, refundOrder } from '../../../lib/auth-client';
import type { CurrentUser, OrderDetailRecord, OrderRecord } from '../../../lib/auth-client';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, LoadingRows } from '../../../components/ui/Feedback';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ThermalReceipt } from '../../../components/orders/ThermalReceipt';
import { displayMoney } from '../../../lib/pos-money';

export default function OrdersPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [items, setItems] = useState<OrderRecord[]>([]);
  const [selected, setSelected] = useState<OrderDetailRecord | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', paymentStatus: '', dateFrom: '', dateTo: '' });
  const [action, setAction] = useState<'CANCEL' | 'REFUND' | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const canCancel = Boolean(user?.permissions.includes('orders:cancel'));
  const canRefund = Boolean(user?.permissions.includes('orders:refund'));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getOrders({ page, limit: 20, ...filters, status: filters.status || undefined,
        paymentStatus: filters.paymentStatus || undefined, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined });
      setItems(result.items); setTotal(result.total);
    } catch (cause) {
      const status = getStatus(cause);
      setError(status === 401 ? 'Hãy đăng nhập để xem đơn hàng.' : status === 403 ? 'Tài khoản không có quyền xem đơn hàng.' : 'Không tải được đơn hàng. Kiểm tra khoảng ngày và thử lại.');
    } finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { currentUser().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { void load(); }, [load]);

  async function openOrder(id: string) {
    setError(''); setSelected(null); setDetailOpen(true); setDetailLoading(true);
    try { setSelected(await getOrder(id)); setAction(null); setReason(''); }
    catch { setError('Không tải được chi tiết đơn hàng.'); }
    finally { setDetailLoading(false); }
  }

  function closeAction() { setAction(null); setReason(''); setDetailOpen(Boolean(selected)); }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !action || !reason.trim()) return;
    setSaving(true); setError(''); setMessage('');
    try {
      if (action === 'CANCEL') await cancelOrder(selected.id, reason.trim());
      else await refundOrder(selected.id, reason.trim());
      setMessage(action === 'CANCEL' ? 'Đã hủy đơn hàng.' : 'Đã hoàn tiền và nhập lại hàng vào tồn kho.');
      setAction(null); setReason(''); await load(); await openOrder(selected.id);
    } catch (cause) {
      const status = getStatus(cause);
      setError(status === 409 ? 'Trạng thái đơn hoặc tồn kho vừa thay đổi. Tải lại đơn rồi thử lại.' : status === 403 ? 'Tài khoản không có quyền thực hiện thao tác này.' : 'Không thực hiện được thao tác.');
    } finally { setSaving(false); }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(filters.dateFrom) !== Boolean(filters.dateTo)) { setError('Nhập cả ngày bắt đầu và ngày kết thúc, hoặc để trống cả hai.'); return; }
    setPage(1); setFilters((old) => ({ ...old, search: searchInput.trim() }));
  }

  return <main className="admin-shell">
    {message && <p role="status" className="notice-success">{message}</p>}{error && <p role="alert" className="notice-error">{error}</p>}
    <section className="admin-card catalog-list-card">
      <div className="catalog-toolbar"><form className="catalog-filters" onSubmit={applyFilters}>
        <label>Tìm đơn<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Mã đơn, tên hoặc điện thoại khách" /></label>
        <label>Trạng thái đơn<select value={filters.status} onChange={(event) => { setPage(1); setFilters((old) => ({ ...old, status: event.target.value })); }}><option value="">Tất cả</option>{['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED'].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Thanh toán<select value={filters.paymentStatus} onChange={(event) => { setPage(1); setFilters((old) => ({ ...old, paymentStatus: event.target.value })); }}><option value="">Tất cả</option>{['PENDING', 'PAID', 'REFUNDED'].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Từ ngày<input type="date" value={filters.dateFrom} onChange={(event) => setFilters((old) => ({ ...old, dateFrom: event.target.value }))} /></label>
        <label>Đến ngày<input type="date" value={filters.dateTo} onChange={(event) => setFilters((old) => ({ ...old, dateTo: event.target.value }))} /></label>
        <button type="submit">Tìm đơn</button></form><span className="muted">{total} đơn</span></div>
      {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState title="Không có đơn hàng phù hợp" description="Thay đổi bộ lọc ngày hoặc trạng thái để tìm đơn." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Nhân viên</th><th>Ngày</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        {items.map((order) => <tr key={order.id}><td><strong>{order.orderCode}</strong></td><td>{order.customer?.name ?? 'Khách lẻ'}</td><td>{order.staff.name}</td><td>{new Date(order.createdAt).toLocaleString('vi-VN')}</td><td className="numeric"><strong>{order.total}</strong></td><td><StatusBadge value={order.paymentStatus} /></td><td><StatusBadge value={order.orderStatus} /></td><td><button className="secondary-button" onClick={() => void openOrder(order.id)}>Chi tiết</button></td></tr>)}
      </tbody></table></div>}
      <div className="pagination-row"><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(total / 20))}</span><button className="secondary-button" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((value) => value + 1)}>Sau</button></div>
    </section>
    <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} size="drawer" title={selected?.orderCode ?? 'Chi tiết đơn hàng'} description={selected ? `Tạo lúc ${new Date(selected.createdAt).toLocaleString('vi-VN')}` : undefined}>
      {detailLoading ? <LoadingRows count={6} /> : error && !selected ? <p role="alert" className="notice-error">{error}</p> : selected && <div className="detail-stack">
        <div className="order-status-row"><StatusBadge value={selected.orderStatus} /><StatusBadge value={selected.paymentStatus} /><span className="muted">{selected.paymentMethod.replaceAll('_', ' ')}</span></div>
        <section className="detail-section"><h3>Thông tin đơn</h3><dl className="detail-list"><div><dt>Khách hàng</dt><dd>{selected.customer?.name ?? 'Khách lẻ'}</dd></div><div><dt>Nhân viên</dt><dd>{selected.staff.name}</dd></div><div><dt>Mã đơn</dt><dd>{selected.orderCode}</dd></div></dl></section>
        <section className="detail-section"><h3>Sản phẩm</h3>{selected.items?.length ? <div className="order-lines">{selected.items.map((line) => <div className="order-line" key={line.id}><div><strong>{line.productNameSnapshot}</strong><small>{line.skuSnapshot} · {line.quantity} sản phẩm × {line.unitPrice}</small></div><strong className="numeric">{line.total}</strong></div>)}</div> : <p className="muted">Không có dòng sản phẩm.</p>}</section>
        <section className="detail-section"><h3>Tổng thanh toán</h3><dl className="detail-list"><div><dt>Tạm tính</dt><dd>{selected.subtotal}</dd></div><div><dt>{selected.discountType === 'PERCENTAGE' ? `Giảm giá (${selected.discountValue}%)` : 'Giảm giá cố định'}</dt><dd>− {selected.discount}</dd></div><div className="detail-total"><dt>Tổng</dt><dd>{selected.total}</dd></div></dl></section>
        {selected.amountReceived !== null && <section className="detail-section"><h3>Thông tin tiền mặt</h3><dl className="detail-list"><div><dt>Tiền khách đưa</dt><dd>{displayMoney(selected.amountReceived, selected.store.currency, selected.store.locale)}</dd></div><div><dt>Tiền thừa</dt><dd>{displayMoney(selected.changeAmount ?? '0', selected.store.currency, selected.store.locale)}</dd></div></dl></section>}
        {selected.refundedAt && <section className="detail-section"><h3>Thông tin hoàn tiền</h3><p>{new Date(selected.refundedAt).toLocaleString('vi-VN')}</p><p className="muted">{selected.refundReason}</p></section>}
        <div className="button-row"><button type="button" className="secondary-button" onClick={() => window.print()}>In hóa đơn</button>{canCancel && selected.orderStatus === 'PENDING' && <button className="danger-button" onClick={() => { setAction('CANCEL'); setReason(''); setDetailOpen(false); }}>Hủy đơn</button>}{canRefund && selected.orderStatus === 'COMPLETED' && selected.paymentStatus === 'PAID' && <button className="danger-button" onClick={() => { setAction('REFUND'); setReason(''); setDetailOpen(false); }}>Hoàn tiền và nhập lại hàng</button>}</div>
        {selected.auditEvents && selected.auditEvents.length > 0 && <section className="detail-section"><h3>Lịch sử thao tác</h3><ol className="timeline">{selected.auditEvents.map((event, index) => <li key={`${event.action}-${index}`}><strong>{event.action === 'REFUND' ? 'Hoàn tiền' : 'Hủy đơn'}</strong><span>{event.actor.name} · {new Date(event.createdAt).toLocaleString('vi-VN')}</span><small>{event.reason}</small></li>)}</ol></section>}
      </div>}
    </Dialog>
    {selected && detailOpen && <ThermalReceipt order={selected} />}
    <Dialog open={Boolean(action)} onClose={closeAction} title={action === 'CANCEL' ? 'Xác nhận hủy đơn' : 'Xác nhận hoàn tiền'} description={action === 'CANCEL' ? 'Đơn PENDING sẽ chuyển sang CANCELLED.' : 'Thao tác này hoàn toàn bộ tiền và nhập lại số lượng hàng vào kho.'} footer={<><button type="button" className="secondary-button" disabled={saving} onClick={closeAction}>Quay lại</button><button type="submit" form="order-action-form" className="danger-button" disabled={saving || !reason.trim()}>{saving ? 'Đang xử lý…' : action === 'CANCEL' ? 'Xác nhận hủy' : 'Xác nhận hoàn tiền'}</button></>}>
      <form id="order-action-form" className="form-grid" onSubmit={submitAction}><label className="full">Lý do<textarea required minLength={1} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{error && <p role="alert" className="notice-error full">{error}</p>}</form>
    </Dialog>
  </main>;
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}
