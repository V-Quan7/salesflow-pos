'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createCategory, currentUser, deleteCategory, getCategories, updateCategory } from '../../../lib/auth-client';
import type { CatalogCategory, CategoryInput, CurrentUser } from '../../../lib/auth-client';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, LoadingRows } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { StatusBadge } from '../../../components/ui/StatusBadge';

const emptyForm: CategoryInput = { name: '', slug: '', description: '', status: 'ACTIVE' };

function slugFromName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function CategoriesPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [items, setItems] = useState<CatalogCategory[]>([]);
  const [form, setForm] = useState<CategoryInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CatalogCategory | null>(null);
  const canManage = user?.role.name === 'OWNER' || user?.role.name === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getCategories({ page, limit: 20, search, status: statusFilter as 'ACTIVE' | 'INACTIVE' | undefined });
      setItems(result.items); setTotal(result.total);
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 401 ? 'Hãy đăng nhập để xem danh mục.' : code === 403 ? 'Tài khoản không có quyền xem danh mục.' : 'Không tải được danh mục.');
    } finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { currentUser().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { void load(); }, [load]);

  function startEdit(category: CatalogCategory) {
    setEditingId(category.id);
    setForm({ name: category.name, slug: category.slug, description: category.description ?? '', status: category.status });
    setMessage(''); setError('');
    setFormOpen(true);
  }

  function resetForm() { setEditingId(null); setForm(emptyForm); setError(''); setFormOpen(false); }
  function startCreate() { setEditingId(null); setForm(emptyForm); setError(''); setFormOpen(true); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      if (editingId) await updateCategory(editingId, form);
      else await createCategory(form);
      setMessage(editingId ? 'Đã cập nhật danh mục.' : 'Đã tạo danh mục.');
      resetForm(); await load();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 409 ? 'Slug này đã được dùng trong cửa hàng.' : code === 403 ? 'Bạn không có quyền sửa danh mục.' : 'Không lưu được danh mục. Kiểm tra lại dữ liệu.');
    } finally { setSaving(false); }
  }

  async function remove(category: CatalogCategory) {
    setError(''); setMessage('');
    try {
      const result = await deleteCategory(category.id);
      setMessage(result.deactivated ? 'Danh mục đang được sản phẩm dùng nên đã chuyển sang Ngừng hoạt động.' : 'Đã xóa danh mục.');
      setPendingDelete(null);
      await load();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 403 ? 'Bạn không có quyền xóa danh mục.' : 'Không xóa được danh mục.'); setPendingDelete(null);
    }
  }

  return <main className="admin-shell">
    {message && <p role="status" className="notice-success">{message}</p>}
    {error && <p role="alert" className="notice-error">{error}</p>}

    <section className="admin-card catalog-list-card">
      <div className="catalog-toolbar">
        <form className="catalog-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <label>Tìm kiếm<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tên hoặc slug" /></label>
          <label>Trạng thái<select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
          <button type="submit"><Icon name="search" size={16} />Tìm</button>
        </form>
        <div className="catalog-toolbar-meta"><span className="muted">{total} danh mục</span>{canManage && <button type="button" onClick={startCreate}><Icon name="plus" />Thêm danh mục</button>}</div>
      </div>
      {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState title="Chưa có danh mục phù hợp" description="Thêm danh mục để tổ chức sản phẩm trong cửa hàng." action={canManage && <button type="button" onClick={startCreate}><Icon name="plus" />Thêm danh mục</button>} /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Tên</th><th>Slug</th><th>Sản phẩm</th><th>Trạng thái</th>{canManage && <th>Thao tác</th>}</tr></thead>
        <tbody>{items.map((category) => <tr key={category.id}>
          <td><strong>{category.name}</strong></td><td><code>{category.slug}</code></td><td>{category._count?.products ?? 0}</td>
          <td><StatusBadge value={category.status} label={category.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'} /></td>
          {canManage && <td className="row-actions"><button type="button" className="secondary-button" onClick={() => startEdit(category)} aria-label={`Sửa ${category.name}`}><Icon name="edit" size={16} />Sửa</button><button type="button" className="danger-button" onClick={() => setPendingDelete(category)} aria-label={`${(category._count?.products ?? 0) > 0 ? 'Ngừng hoạt động' : 'Xóa'} ${category.name}`}><Icon name="trash" size={16} />{(category._count?.products ?? 0) > 0 ? 'Ngừng' : 'Xóa'}</button></td>}
        </tr>)}</tbody>
      </table></div>}
      <div className="pagination-row"><button type="button" className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((old) => old - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(total / 20))}</span><button type="button" className="secondary-button" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((old) => old + 1)}>Sau</button></div>
    </section>

    <Dialog open={formOpen} onClose={resetForm} title={editingId ? 'Sửa danh mục' : 'Thêm danh mục'} description="Thông tin danh mục hiển thị trong cửa hàng." footer={<><button type="button" className="secondary-button" onClick={resetForm}>Hủy</button><button type="submit" form="category-form" disabled={saving}>{saving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo danh mục'}</button></>}>
      <form id="category-form" className="form-grid" onSubmit={submit}>
        {error && <p role="alert" className="notice-error full">{error}</p>}
        <label>Tên danh mục<input required maxLength={120} value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value, ...(editingId ? {} : { slug: slugFromName(event.target.value) }) }))} /></label>
        <label>Slug<input required maxLength={160} value={form.slug} onChange={(event) => setForm((old) => ({ ...old, slug: event.target.value }))} /></label>
        <label className="full">Mô tả<textarea maxLength={2000} value={form.description ?? ''} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} /></label>
        <label>Trạng thái<select value={form.status} onChange={(event) => setForm((old) => ({ ...old, status: event.target.value as CategoryInput['status'] }))}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
      </form>
    </Dialog>
    <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title={pendingDelete && (pendingDelete._count?.products ?? 0) > 0 ? 'Ngừng danh mục?' : 'Xóa danh mục?'} description={pendingDelete && (pendingDelete._count?.products ?? 0) > 0 ? 'Danh mục đang có sản phẩm sẽ được giữ lại và chuyển sang trạng thái ngừng hoạt động.' : 'Thao tác này sẽ xóa danh mục chưa được sản phẩm sử dụng.'} footer={<><button type="button" className="secondary-button" onClick={() => setPendingDelete(null)}>Quay lại</button><button type="button" className="danger-button" onClick={() => pendingDelete && void remove(pendingDelete)}>Xác nhận</button></>}>
      {error && <p role="alert" className="notice-error">{error}</p>}<p>Bạn có chắc muốn tiếp tục với danh mục <strong>{pendingDelete?.name}</strong>?</p>
    </Dialog>
  </main>;
}
