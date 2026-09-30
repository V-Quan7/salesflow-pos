'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

import { createProduct, currentUser, deleteProduct, getCategories, getProducts, updateProduct } from '../../../lib/auth-client';
import type { CatalogCategory, CatalogProduct, CurrentUser, ProductInput, ProductUpdateInput } from '../../../lib/auth-client';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, LoadingRows } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { StatusBadge } from '../../../components/ui/StatusBadge';

const emptyForm: ProductInput = { sku: '', name: '', description: '', categoryId: '', costPrice: '0', sellingPrice: '0', unit: 'piece', stockQuantity: 0, minStock: 0, status: 'ACTIVE' };
const imageAccept = 'image/png,image/jpeg,image/webp,image/x-icon';

export default function ProductsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [form, setForm] = useState<ProductInput>(emptyForm);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CatalogProduct | null>(null);
  const canManage = user?.role.name === 'OWNER' || user?.role.name === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getProducts({ page, limit: 20, search, status: statusFilter as 'ACTIVE' | 'INACTIVE' | undefined, categoryId: categoryFilter || undefined });
      setItems(result.items); setTotal(result.total);
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 401 ? 'Hãy đăng nhập để xem sản phẩm.' : code === 403 ? 'Tài khoản không có quyền xem sản phẩm.' : 'Không tải được sản phẩm.');
    } finally { setLoading(false); }
  }, [page, search, statusFilter, categoryFilter]);

  useEffect(() => { currentUser().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { getCategories({ page: 1, limit: 100 }).then((result) => setCategories(result.items)).catch(() => setCategories([])); }, []);
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile); setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreview(removeImage ? null : editing?.imageUrl ?? null);
    return undefined;
  }, [imageFile, editing, removeImage]);

  function startEdit(product: CatalogProduct) {
    setEditing(product); setImageFile(null); setRemoveImage(false); setError(''); setMessage('');
    setForm({ sku: product.sku, name: product.name, description: product.description ?? '', categoryId: product.categoryId,
      costPrice: product.costPrice, sellingPrice: product.sellingPrice, unit: product.unit, stockQuantity: 0,
      minStock: product.minStock, status: product.status });
    setFormOpen(true);
  }

  function resetForm() { setEditing(null); setImageFile(null); setRemoveImage(false); setForm(emptyForm); setError(''); setFormOpen(false); }
  function startCreate() { setEditing(null); setImageFile(null); setRemoveImage(false); setForm(emptyForm); setError(''); setFormOpen(true); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      if (imageFile && imageFile.size > 5 * 1024 * 1024) throw Object.assign(new Error('image-too-large'), { status: 413 });
      if (editing) {
        const editableFields = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'stockQuantity')) as ProductUpdateInput;
        await updateProduct(editing.id, { ...editableFields, ...(removeImage ? { removeImage: true } : {}) }, imageFile ?? undefined);
      }
      else await createProduct(form, imageFile ?? undefined);
      setMessage(editing ? 'Đã cập nhật sản phẩm.' : 'Đã tạo sản phẩm.');
      resetForm(); await load();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 409 ? 'SKU này đã được dùng trong cửa hàng.' : code === 400 ? 'Dữ liệu hoặc ảnh không hợp lệ.' : code === 403 ? 'Bạn không có quyền sửa sản phẩm.' : code === 413 ? 'Ảnh vượt quá giới hạn 5 MB.' : 'Không lưu được sản phẩm.');
    } finally { setSaving(false); }
  }

  async function remove(product: CatalogProduct) {
    setError(''); setMessage('');
    try {
      const result = await deleteProduct(product.id);
      setMessage(result.deactivated ? 'Sản phẩm có liên kết giao dịch nên đã chuyển sang Ngừng hoạt động.' : 'Đã xóa sản phẩm.');
      setPendingDelete(null);
      await load();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(code === 403 ? 'Bạn không có quyền xóa sản phẩm.' : 'Không xóa được sản phẩm.'); setPendingDelete(null);
    }
  }

  return <main className="admin-shell">
    {message && <p role="status" className="notice-success">{message}</p>}
    {error && <p role="alert" className="notice-error">{error}</p>}

    <section className="admin-card catalog-list-card">
      <div className="catalog-toolbar">
        <form className="catalog-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <label>Tìm kiếm<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tên hoặc SKU" /></label>
          <label>Danh mục<select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value); }}><option value="">Tất cả danh mục</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Trạng thái<select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
          <button type="submit"><Icon name="search" size={16} />Tìm</button>
        </form>
        <div className="catalog-toolbar-meta"><span className="muted">{total} sản phẩm</span>{canManage && <button type="button" onClick={startCreate}><Icon name="plus" />Thêm sản phẩm</button>}</div>
      </div>
      {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState title="Chưa có sản phẩm phù hợp" description="Thử thay đổi bộ lọc hoặc thêm sản phẩm mới." action={canManage && <button type="button" onClick={startCreate}><Icon name="plus" />Thêm sản phẩm</button>} /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Ảnh</th><th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Tồn kho</th><th>Trạng thái</th>{canManage && <th>Thao tác</th>}</tr></thead>
        <tbody>{items.map((product) => <tr key={product.id}>
          <td>{product.imageUrl ? <Image src={product.imageUrl} alt={product.name} width={48} height={48} unoptimized className="product-thumb" /> : <span className="product-thumb-placeholder"><Icon name="box" size={18} /></span>}</td>
          <td><strong>{product.name}</strong><br /><code>{product.sku}</code></td><td>{product.category.name}</td>
          <td className="numeric"><strong>{product.sellingPrice}</strong><br /><small className="muted">mỗi {product.unit}</small></td><td className="numeric">{product.stockQuantity} <small className="muted">/ min {product.minStock}</small></td>
          <td><StatusBadge value={product.status} label={product.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng bán'} /></td>
          {canManage && <td className="row-actions"><button type="button" className="secondary-button" onClick={() => startEdit(product)} aria-label={`Sửa ${product.name}`}><Icon name="edit" size={16} />Sửa</button><button type="button" className="icon-button danger-icon-button" onClick={() => setPendingDelete(product)} aria-label={`Xóa ${product.name}`} title="Xóa"><Icon name="trash" size={16} /></button></td>}
        </tr>)}</tbody>
      </table></div>}
      <div className="pagination-row"><button type="button" className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((old) => old - 1)}>Trước</button><span>Trang {page} / {Math.max(1, Math.ceil(total / 20))}</span><button type="button" className="secondary-button" disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((old) => old + 1)}>Sau</button></div>
    </section>

    <Dialog open={formOpen} onClose={resetForm} size="large" title={editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} description="Thông tin sản phẩm và giá bán trong cửa hàng." footer={<><button type="button" className="secondary-button" onClick={resetForm}>Hủy</button><button type="submit" form="product-form" disabled={saving || categories.length === 0}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</button></>}>
      <form id="product-form" className="form-grid" onSubmit={submit}>
        {error && <p role="alert" className="notice-error full">{error}</p>}
        <label>SKU<input required maxLength={100} value={form.sku} onChange={(event) => setForm((old) => ({ ...old, sku: event.target.value.toUpperCase() }))} /></label>
        <label>Tên sản phẩm<input required maxLength={160} value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} /></label>
        <label>Danh mục<select required value={form.categoryId} onChange={(event) => setForm((old) => ({ ...old, categoryId: event.target.value }))}><option value="">Chọn danh mục</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.status === 'INACTIVE' ? ' (Ngừng hoạt động)' : ''}</option>)}</select></label>
        <label>Đơn vị<input required maxLength={40} value={form.unit} onChange={(event) => setForm((old) => ({ ...old, unit: event.target.value }))} /></label>
        <label>Giá nhập<input required type="number" min="0" step="any" value={form.costPrice} onChange={(event) => setForm((old) => ({ ...old, costPrice: event.target.value }))} /></label>
        <label>Giá bán<input required type="number" min="0" step="any" value={form.sellingPrice} onChange={(event) => setForm((old) => ({ ...old, sellingPrice: event.target.value }))} /></label>
        {editing ? <div><strong>Tồn kho hiện tại</strong><p>{editing.stockQuantity} · <Link href="/admin/inventory">Điều chỉnh tại trang Tồn kho</Link></p></div> : <label>Tồn kho ban đầu<input required type="number" min="0" step="1" value={form.stockQuantity} onChange={(event) => setForm((old) => ({ ...old, stockQuantity: Number(event.target.value) }))} /></label>}
        <label>Tồn kho tối thiểu<input required type="number" min="0" step="1" value={form.minStock} onChange={(event) => setForm((old) => ({ ...old, minStock: Number(event.target.value) }))} /></label>
        <label>Trạng thái<select value={form.status} onChange={(event) => setForm((old) => ({ ...old, status: event.target.value as ProductInput['status'] }))}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
        <label>Ảnh sản phẩm<input type="file" accept={imageAccept} disabled={saving} onChange={(event) => { setImageFile(event.target.files?.[0] ?? null); setRemoveImage(false); }} /></label>
        <label className="full">Mô tả<textarea maxLength={5000} value={form.description ?? ''} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} /></label>
        {imagePreview && <div className="full product-image-preview"><Image src={imagePreview} alt={`Ảnh ${form.name || 'sản phẩm'}`} width={140} height={110} unoptimized />{editing && !imageFile && <button type="button" className="danger-button" onClick={() => setRemoveImage(true)}>Xóa ảnh hiện tại</button>}</div>}
        {editing && imageFile && <p className="full muted">Ảnh mới sẽ thay ảnh hiện tại sau khi lưu thành công.</p>}
        {categories.length === 0 && <p className="full form-hint">Tạo danh mục trước khi thêm sản phẩm.</p>}
      </form>
    </Dialog>
    <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="Xóa sản phẩm?" description="Sản phẩm có giao dịch sẽ được giữ lại và chuyển sang trạng thái ngừng bán." footer={<><button type="button" className="secondary-button" onClick={() => setPendingDelete(null)}>Quay lại</button><button type="button" className="danger-button" onClick={() => pendingDelete && void remove(pendingDelete)}>Xác nhận xóa</button></>}>
      {error && <p role="alert" className="notice-error">{error}</p>}<p>Bạn có chắc muốn xóa <strong>{pendingDelete?.name}</strong>?</p>
    </Dialog>
  </main>;
}
