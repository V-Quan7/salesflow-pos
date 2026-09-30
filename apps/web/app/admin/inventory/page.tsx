'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { adjustInventory, currentUser, getInventory, getInventoryHistory } from '../../../lib/auth-client';
import type { CurrentUser, InventoryItem, InventoryTransaction } from '../../../lib/auth-client';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, LoadingRows } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { StatusBadge } from '../../../components/ui/StatusBadge';

export default function InventoryPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [lowStock, setLowStock] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [adjustmentMode, setAdjustmentMode] = useState(false);
  const canAdjust = user?.role.name === 'OWNER' || user?.role.name === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getInventory({ page, limit: 20, search, status: status as 'ACTIVE' | 'INACTIVE' | undefined,
        lowStock: lowStock === '' ? undefined : lowStock === 'true', sortBy: 'name', order: 'asc' });
      setItems(result.items); setTotal(result.total);
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 401 ? 'Hãy đăng nhập để xem tồn kho.' : code === 403 ? 'Tài khoản không có quyền xem tồn kho.' : 'Không tải được tồn kho.');
    } finally { setLoading(false); }
  }, [page, search, status, lowStock]);

  useEffect(() => { currentUser().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { void load(); }, [load]);

  async function showHistory(product: InventoryItem) {
    setSelected(product); setDetailOpen(true); setAdjustmentMode(false); setHistoryLoading(true); setHistory([]); setError('');
    try { setHistory((await getInventoryHistory(product.id, { page: 1, limit: 50 })).items); }
    catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 403 ? 'Bạn không có quyền xem lịch sử.' : 'Không tải được lịch sử tồn kho.');
    } finally { setHistoryLoading(false); }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const delta = Number(quantity);
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await adjustInventory({ productId: selected.id, quantity: delta, ...(note.trim() ? { note: note.trim() } : {}) });
      setMessage(`Đã điều chỉnh ${selected.name}: ${result.transaction.beforeQuantity} → ${result.stockQuantity}.`);
      setQuantity(''); setNote(''); setAdjustmentMode(false); await load(); await showHistory({ ...selected, stockQuantity: result.stockQuantity, lowStock: result.stockQuantity <= selected.minStock });
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 409 ? 'Điều chỉnh làm tồn kho âm hoặc tồn kho vừa thay đổi. Tải lại rồi thử lại.' : code === 403 ? 'Bạn không có quyền điều chỉnh tồn kho.' : code === 400 ? 'Nhập số nguyên khác 0.' : 'Không điều chỉnh được tồn kho.');
    } finally { setSaving(false); }
  }

  const nextQuantity = selected && quantity !== '' && Number.isInteger(Number(quantity)) ? selected.stockQuantity + Number(quantity) : null;

  return <main className="admin-shell">
    {message && <p role="status" className="notice-success">{message}</p>}
    {error && <p role="alert" className="notice-error">{error}</p>}
    <section className="admin-card catalog-list-card">
      <div className="catalog-toolbar"><form className="catalog-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
        <label>Tìm sản phẩm<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tên hoặc SKU" /></label>
        <label>Trạng thái<select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
        <label>Tồn kho<select value={lowStock} onChange={(event) => { setPage(1); setLowStock(event.target.value); }}><option value="">Tất cả</option><option value="true">Sắp hết / chạm mức tối thiểu</option><option value="false">Trên mức tối thiểu</option></select></label>
        <button type="submit"><Icon name="search" size={16} />Tìm</button></form><span className="muted">{total} sản phẩm</span></div>
      {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState title="Không có sản phẩm phù hợp" description="Thay đổi tìm kiếm hoặc bộ lọc tồn kho." /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Tồn hiện tại</th><th>Tồn tối thiểu</th><th>Trạng thái tồn</th><th>Thao tác</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><br /><code>{item.sku}</code></td><td>{item.category.name}</td>
          <td className="numeric"><strong>{item.stockQuantity}</strong> {item.unit}</td><td className="numeric">{item.minStock} {item.unit}</td>
          <td><StatusBadge value={item.stockQuantity === 0 ? 'OUT_OF_STOCK' : item.lowStock ? 'LOW_STOCK' : 'HEALTHY'} label={item.stockQuantity === 0 ? 'Hết hàng' : item.lowStock ? 'Sắp hết' : 'Đủ hàng'} /></td>
          <td className="row-actions"><button type="button" className="secondary-button" onClick={() => void showHistory(item)}>Lịch sử</button>{canAdjust && <button type="button" onClick={() => { setSelected(item); setQuantity(''); setNote(''); setHistory([]); setHistoryLoading(false); setAdjustmentMode(true); setDetailOpen(true); }}><Icon name="plus" size={15} />Điều chỉnh</button>}</td></tr>)}</tbody>
      </table></div>}
      <div className="pagination-row"><button type="button" className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(total / 20))}</span><button type="button" className="secondary-button" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((value) => value + 1)}>Sau</button></div>
    </section>
    <Dialog open={detailOpen} onClose={() => { setDetailOpen(false); setSelected(null); setHistory([]); }} size="drawer" title={selected?.name ?? 'Tồn kho'} description={selected ? `${selected.sku} · ${selected.category.name}` : undefined}>
      {selected && <div className="detail-stack"><div className="stock-summary"><div><span>Tồn hiện tại</span><strong>{selected.stockQuantity} <small>{selected.unit}</small></strong></div><div><span>Mức tối thiểu</span><strong>{selected.minStock} <small>{selected.unit}</small></strong></div><StatusBadge value={selected.stockQuantity === 0 ? 'OUT_OF_STOCK' : selected.lowStock ? 'LOW_STOCK' : 'HEALTHY'} label={selected.stockQuantity === 0 ? 'Hết hàng' : selected.lowStock ? 'Sắp hết' : 'Đủ hàng'} /></div>
      {error && <p role="alert" className="notice-error">{error}</p>}
      {canAdjust && !adjustmentMode && <div className="button-row"><button type="button" onClick={() => { setAdjustmentMode(true); setQuantity(''); setNote(''); }}><Icon name="plus" size={16} />Điều chỉnh tồn</button></div>}
      {canAdjust && adjustmentMode && <section className="detail-section"><h3>Điều chỉnh tồn kho</h3><form className="form-grid" onSubmit={submitAdjustment}>
        {error && <p role="alert" className="notice-error full">{error}</p>}
        <label>Điều chỉnh (+ nhập, − giảm)<input required type="number" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ví dụ: 5 hoặc -2" /></label>
        <label>Ghi chú (không bắt buộc)<input maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <p className="full form-hint">Số lượng sau điều chỉnh: <strong>{nextQuantity === null ? '—' : `${nextQuantity} ${selected.unit}`}</strong>. Tồn kho không được âm.</p>
        <div className="full button-row"><button disabled={saving || !quantity || !Number.isInteger(Number(quantity)) || Number(quantity) === 0 || (nextQuantity ?? 0) < 0}>{saving ? 'Đang lưu…' : 'Lưu điều chỉnh'}</button><button type="button" className="secondary-button" disabled={saving} onClick={() => setAdjustmentMode(false)}>Hủy</button></div>
      </form></section>}
      <section className="detail-section"><div className="catalog-toolbar"><h3>Lịch sử tồn kho</h3>{history.length === 0 && !historyLoading && !adjustmentMode && <button type="button" className="secondary-button" onClick={() => void showHistory(selected)}>Tải lịch sử</button>}</div>
      {historyLoading ? <LoadingRows count={4} /> : history.length === 0 ? <EmptyState title={adjustmentMode ? 'Chưa tải lịch sử' : 'Chưa có giao dịch tồn kho'} description={adjustmentMode ? 'Lưu điều chỉnh để xem giao dịch mới nhất.' : 'Lịch sử sẽ xuất hiện sau khi có thay đổi tồn kho.'} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Thời gian</th><th>Thay đổi</th><th>Trước → Sau</th><th>Người thực hiện</th><th>Ghi chú</th></tr></thead><tbody>
        {history.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString()}</td><td>{entry.quantity > 0 ? '+' : ''}{entry.quantity}</td><td>{entry.beforeQuantity} → {entry.afterQuantity}</td><td>{entry.creator.name}</td><td>{entry.note || '—'}</td></tr>)}
      </tbody></table></div>}</section></div>}
    </Dialog>
  </main>;
}
