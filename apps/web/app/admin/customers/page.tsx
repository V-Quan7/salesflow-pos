'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createCustomer, currentUser, deleteCustomer, getCustomerHistory, getCustomers, updateCustomer } from '../../../lib/auth-client';
import type { CatalogPage, CustomerHistory, CustomerInput, CustomerRecord, CurrentUser } from '../../../lib/auth-client';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, LoadingRows } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { StatusBadge } from '../../../components/ui/StatusBadge';

const blank: CustomerInput = { name: '', phone: '', email: '', address: '', note: '', status: 'ACTIVE' };

export default function CustomersPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerInput>(blank);
  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomerRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const canManage = user?.role.name === 'OWNER' || user?.role.name === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: CatalogPage<CustomerRecord> = await getCustomers({ page, limit: 20, search, status: status as 'ACTIVE' | 'INACTIVE' | undefined });
      setCustomers(result.items); setTotal(result.total);
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 401 ? 'Đăng nhập để xem khách hàng.' : code === 403 ? 'Tài khoản không có quyền xem khách hàng.' : 'Không tải được danh sách khách hàng.');
    } finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { currentUser().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { void load(); }, [load]);

  async function openCustomer(customer: CustomerRecord) {
    setSelected(customer); setHistory(null); setError(''); setDetailOpen(true); setHistoryLoading(true);
    try { setHistory(await getCustomerHistory(customer.id, { page: 1, limit: 20 })); }
    catch { setError('Không tải được lịch sử mua hàng.'); }
    finally { setHistoryLoading(false); }
  }

  function editCustomer(customer: CustomerRecord) {
    setEditing(customer.id); setForm({ name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', address: customer.address ?? '', note: customer.note ?? '', status: customer.status });
    setMessage(''); setError(''); setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const input = { ...form, name: form.name.trim(), phone: form.phone?.trim() || null, email: form.email?.trim() || null,
        address: form.address?.trim() || null, note: form.note?.trim() || null };
      if (editing) await updateCustomer(editing, input); else await createCustomer(input);
      setMessage(editing ? 'Đã cập nhật khách hàng.' : 'Đã tạo khách hàng.'); setEditing(null); setForm(blank); setFormOpen(false); await load();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 403 ? 'Bạn không có quyền thay đổi khách hàng.' : code === 400 ? 'Hãy kiểm tra tên và địa chỉ email.' : 'Không lưu được khách hàng.');
    } finally { setSaving(false); }
  }

  async function remove(customer: CustomerRecord) {
    setError(''); setMessage('');
    try {
      const result = await deleteCustomer(customer.id);
      setMessage(result.deactivated ? 'Khách hàng có lịch sử đơn hàng nên đã chuyển sang Ngừng hoạt động.' : 'Đã xóa khách hàng.');
      setPendingDelete(null);
      if (selected?.id === customer.id) { setSelected(null); setHistory(null); setDetailOpen(false); }
      await load();
    } catch { setError('Không thể xóa hoặc ngừng hoạt động khách hàng.'); setPendingDelete(null); }
  }

  return <main className="admin-shell">
    {message && <p role="status" className="notice-success">{message}</p>}{error && <p role="alert" className="notice-error">{error}</p>}
    <section className="admin-card catalog-list-card">
      <div className="catalog-toolbar"><form className="catalog-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
        <label>Tìm khách hàng<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tên, điện thoại hoặc email" /></label>
        <label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
        <button type="submit"><Icon name="search" size={16} />Tìm</button></form><div className="catalog-toolbar-meta"><span className="muted">{total} khách hàng</span>{canManage && <button type="button" onClick={() => { setEditing(null); setForm(blank); setFormOpen(true); }}><Icon name="plus" />Thêm khách hàng</button>}</div></div>
      {loading ? <LoadingRows /> : customers.length === 0 ? <EmptyState title="Chưa có khách hàng phù hợp" description="Thử điều chỉnh bộ lọc hoặc thêm khách hàng." action={canManage && <button type="button" onClick={() => { setEditing(null); setForm(blank); setFormOpen(true); }}><Icon name="plus" />Thêm khách hàng</button>} /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Khách hàng</th><th>Điện thoại</th><th>Email</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}>
          <td><button type="button" className="text-button" onClick={() => void openCustomer(customer)}><strong>{customer.name}</strong></button></td><td>{customer.phone || '—'}</td><td>{customer.email || '—'}</td>
          <td><StatusBadge value={customer.status} label={customer.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'} /></td>
          <td className="row-actions"><button type="button" className="secondary-button" onClick={() => void openCustomer(customer)}>Lịch sử</button>{canManage && <><button type="button" className="secondary-button" onClick={() => editCustomer(customer)} aria-label={`Sửa ${customer.name}`}><Icon name="edit" size={16} />Sửa</button><button type="button" className="icon-button danger-icon-button" onClick={() => setPendingDelete(customer)} aria-label={`Xóa ${customer.name}`}><Icon name="trash" size={16} /></button></>}</td>
        </tr>)}</tbody></table></div>}
      <div className="pagination-row"><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(total / 20))}</span><button className="secondary-button" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((value) => value + 1)}>Sau</button></div>
    </section>

    <Dialog open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); setForm(blank); }} title={editing ? 'Sửa khách hàng' : 'Thêm khách hàng'} description="Cập nhật thông tin hồ sơ khách hàng." footer={<><button type="button" className="secondary-button" onClick={() => { setFormOpen(false); setEditing(null); setForm(blank); }}>Hủy</button><button type="submit" form="customer-form" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo khách hàng'}</button></>}>
      <form id="customer-form" className="form-grid" onSubmit={submit}>
        {error && <p role="alert" className="notice-error full">{error}</p>}
        <label>Tên khách hàng<input required maxLength={150} value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} /></label>
        <label>Số điện thoại<input maxLength={40} value={form.phone ?? ''} onChange={(event) => setForm((old) => ({ ...old, phone: event.target.value }))} /></label>
        <label>Email<input type="email" maxLength={255} value={form.email ?? ''} onChange={(event) => setForm((old) => ({ ...old, email: event.target.value }))} /></label>
        <label>Trạng thái<select value={form.status} onChange={(event) => setForm((old) => ({ ...old, status: event.target.value as CustomerInput['status'] }))}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
        <label className="full">Địa chỉ<textarea maxLength={500} value={form.address ?? ''} onChange={(event) => setForm((old) => ({ ...old, address: event.target.value }))} /></label>
        <label className="full">Ghi chú<textarea maxLength={2000} value={form.note ?? ''} onChange={(event) => setForm((old) => ({ ...old, note: event.target.value }))} /></label>
      </form>
    </Dialog>
    <Dialog open={detailOpen} onClose={() => { setDetailOpen(false); setSelected(null); setHistory(null); }} size="drawer" title={selected?.name ?? 'Khách hàng'} description={`${selected?.phone || 'Không có điện thoại'} · ${selected?.email || 'Không có email'}`}>
      {selected && <div className="detail-stack"><StatusBadge value={selected.status} label={selected.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'} />
        {historyLoading ? <LoadingRows count={4} /> : history ? <><div className="summary-grid"><div className="summary-tile"><span>Đơn hoàn tất</span><strong>{history.summary.totalOrders}</strong></div><div className="summary-tile"><span>Tổng mua</span><strong className="numeric">{history.summary.totalPurchaseAmount}</strong></div></div><h3>Lịch sử đơn hàng</h3>
          {history.orders.items.length === 0 ? <EmptyState title="Chưa có đơn hàng" description="Chỉ các đơn hoàn tất và đã thanh toán xuất hiện tại đây." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Đơn hàng</th><th>Ngày</th><th>Tổng</th></tr></thead><tbody>{history.orders.items.map((order) => <tr key={order.id}><td><strong>{order.orderCode}</strong><br /><small>{order.items.map((item) => `${item.productNameSnapshot} × ${item.quantity}`).join(', ')}</small></td><td>{new Date(order.createdAt).toLocaleDateString('vi-VN')}</td><td className="numeric">{order.total}</td></tr>)}</tbody></table></div>}</> : <p className="muted">Không tải được lịch sử mua hàng.</p>}
      </div>}
    </Dialog>
    <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="Xóa khách hàng?" description="Khách hàng có lịch sử đơn sẽ được giữ lại và chuyển sang trạng thái ngừng hoạt động." footer={<><button type="button" className="secondary-button" onClick={() => setPendingDelete(null)}>Quay lại</button><button type="button" className="danger-button" onClick={() => pendingDelete && void remove(pendingDelete)}>Xác nhận</button></>}>
      {error && <p role="alert" className="notice-error">{error}</p>}<p>Bạn có chắc muốn tiếp tục với <strong>{pendingDelete?.name}</strong>?</p>
    </Dialog>
  </main>;
}
