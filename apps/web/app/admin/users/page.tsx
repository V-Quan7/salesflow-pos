'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { createUser, currentUser, deactivateUser, getPermissions, getRoles, getUser, getUsers, updateUser } from '../../../lib/auth-client';
import type { CurrentUser, PaginatedUsers, PermissionRecord, RoleRecord, UserRecord, UsersQuery } from '../../../lib/auth-client';
import { assignableRoles, buildCreateUserInput, buildUpdateUserInput, buildUsersQuery, groupPermissions, hasPermission, initials, isTargetInCurrentStore, userActions, userApiError, userListState } from '../../../lib/user-management';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, LoadingRows } from '../../../components/ui/Feedback';
import { Icon } from '../../../components/ui/Icon';
import { StatusBadge } from '../../../components/ui/StatusBadge';

const PAGE_SIZE = 20;
const emptyPage: PaginatedUsers = { items: [], total: 0, page: 1, limit: PAGE_SIZE };
type AccessState = 'checking' | 'ready' | 'unauthenticated' | 'forbidden' | 'unsupported' | 'error';
type UserFormState = { name: string; email: string; password: string; roleId: string };
const emptyForm: UserFormState = { name: '', email: '', password: '', roleId: '' };

function errorStatus(cause: unknown): number | undefined {
  return typeof cause === 'object' && cause !== null && 'status' in cause
    ? Number((cause as { status?: unknown }).status)
    : undefined;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function RoleBadge({ name }: { name: string }) {
  return <span className="user-role-badge"><Icon name="user" size={14} />{name}</span>;
}

function UserIdentity({ user }: { user: UserRecord }) {
  return <span className="user-identity">
    <span className="user-avatar" aria-hidden="true">{initials(user.name)}</span>
    <span className="user-identity-copy"><strong>{user.name}</strong><small>{user.email}</small></span>
  </span>;
}

export default function UsersPage() {
  const [actor, setActor] = useState<CurrentUser | null>(null);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [access, setAccess] = useState<AccessState>('checking');
  const [accessError, setAccessError] = useState('');
  const [pageResult, setPageResult] = useState<PaginatedUsers>(emptyPage);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UsersQuery['status']>('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [pendingDeactivation, setPendingDeactivation] = useState<UserRecord | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const requestNumber = useRef(0);

  const canCreate = Boolean(actor && hasPermission(actor.permissions, 'users:create'));
  const canReadRoles = Boolean(actor && hasPermission(actor.permissions, 'roles:read'));
  const canReadPermissions = Boolean(actor && hasPermission(actor.permissions, 'permissions:read'));
  const canShowMatrix = canReadRoles && canReadPermissions;
  const storeRoles = useMemo(() => actor ? roles.filter((role) => role.storeId === actor.store.id) : [], [actor, roles]);
  const selectableRoles = useMemo(() => actor ? assignableRoles(storeRoles, actor.store.id, actor.permissions) : [], [actor, storeRoles]);
  const permissionGroups = useMemo(() => groupPermissions(permissions), [permissions]);
  const visibleUsers = useMemo(() => actor ? pageResult.items.filter((user) => isTargetInCurrentStore(user, actor.store.id)) : [], [actor, pageResult.items]);
  const listState = userListState(loading, listError, visibleUsers, search, status ?? '');
  const excludedForeignUsers = visibleUsers.length !== pageResult.items.length;
  const maxPage = Math.max(1, Math.ceil(pageResult.total / PAGE_SIZE));

  useEffect(() => {
    let active = true;
    async function initialize() {
      setAccess('checking');
      setAccessError('');
      try {
        const current = await currentUser();
        if (!active) return;
        setActor(current);
        if (!hasPermission(current.permissions, 'users:read')) {
          setAccess('forbidden');
          return;
        }
        if (!hasPermission(current.permissions, 'roles:read')) {
          setAccess('unsupported');
          setAccessError('Không thể xác nhận phạm vi cửa hàng vì tài khoản không có quyền đọc Role.');
          return;
        }
        const availableRoles = await getRoles();
        if (!active) return;
        setRoles(availableRoles);
        const ownRole = availableRoles.find((role) => role.id === current.role.id);
        if (!ownRole || ownRole.storeId !== current.store.id) {
          setAccess('unsupported');
          setAccessError('Giao diện này chỉ hỗ trợ quản lý người dùng trong cửa hàng hiện tại.');
          return;
        }
        if (hasPermission(current.permissions, 'permissions:read')) {
          try {
            const permissionRows = await getPermissions();
            if (active) setPermissions(permissionRows);
          } catch (cause) {
            if (!active) return;
            const code = errorStatus(cause);
            if (code === 401) { setAccess('unauthenticated'); return; }
            setAccessError('Không tải được danh mục quyền; phần ma trận quyền hiện chưa khả dụng.');
          }
        }
        if (active) setAccess('ready');
      } catch (cause) {
        if (!active) return;
        const code = errorStatus(cause);
        if (code === 401) setAccess('unauthenticated');
        else if (code === 403) setAccess('forbidden');
        else { setAccess('error'); setAccessError(userApiError(cause)); }
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  const loadUsers = useCallback(async () => {
    if (access !== 'ready') return;
    const requestId = ++requestNumber.current;
    setLoading(true);
    setListError('');
    try {
      const result = await getUsers(buildUsersQuery(page, PAGE_SIZE, search, status));
      if (requestId === requestNumber.current) setPageResult(result);
    } catch (cause) {
      if (requestId !== requestNumber.current) return;
      const code = errorStatus(cause);
      if (code === 401) setAccess('unauthenticated');
      setListError(userApiError(cause));
    } finally {
      if (requestId === requestNumber.current) setLoading(false);
    }
  }, [access, page, search, status]);

  useEffect(() => { void loadUsers(); }, [loadUsers, refreshKey]);

  useEffect(() => {
    const normalized = searchInput.trim();
    if (normalized === search) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(normalized);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    setForm({ name: user.name, email: user.email, password: '', roleId: user.role.id });
    setFormError('');
    setFormOpen(true);
  }

  async function openDetail(user: UserRecord) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setSelected(null);
    try {
      const record = await getUser(user.id);
      if (!actor || !isTargetInCurrentStore(record, actor.store.id)) {
        setDetailError('Người dùng không thuộc cửa hàng hiện tại.');
        return;
      }
      setSelected(record);
    } catch (cause) {
      setDetailError(userApiError(cause));
    } finally { setDetailLoading(false); }
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setNotice('');
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) { setFormError('Nhập tên người dùng.'); setSaving(false); return; }
    if (!editing && (form.password.length < 12 || form.password.length > 128)) {
      setFormError('Mật khẩu phải có từ 12 đến 128 ký tự.'); setSaving(false); return;
    }
    if (!form.roleId) { setFormError('Chọn vai trò cho người dùng.'); setSaving(false); return; }
    try {
      if (editing) {
        const updated = await updateUser(editing.id, buildUpdateUserInput({ name, email, roleId: form.roleId }, editing.role.id));
        if (selected?.id === updated.id) setSelected(updated);
        setNotice('Đã cập nhật người dùng.');
      } else {
        await createUser(buildCreateUserInput({ name, email, password: form.password, roleId: form.roleId }));
        setNotice('Đã tạo người dùng. Mật khẩu không được lưu lại trên màn hình.');
      }
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      const code = errorStatus(cause);
      if (code === 401) setAccess('unauthenticated');
      setFormError(userApiError(cause));
    } finally { setSaving(false); }
  }

  async function activate(user: UserRecord) {
    setNotice('');
    setListError('');
    try {
      await updateUser(user.id, { status: 'ACTIVE' });
      setNotice(`Đã kích hoạt tài khoản ${user.name}.`);
      setRefreshKey((value) => value + 1);
      if (selected?.id === user.id) setSelected({ ...selected, status: 'ACTIVE' });
    } catch (cause) {
      const message = userApiError(cause);
      if (errorStatus(cause) === 401) setAccess('unauthenticated');
      setListError(message);
    }
  }

  async function deactivate() {
    if (!pendingDeactivation) return;
    setDeactivating(true);
    setListError('');
    setNotice('');
    try {
      await deactivateUser(pendingDeactivation.id);
      setNotice(`Đã vô hiệu hóa tài khoản ${pendingDeactivation.name}. Các phiên đăng nhập đang hoạt động đã bị thu hồi.`);
      if (selected?.id === pendingDeactivation.id) setSelected({ ...selected, status: 'INACTIVE' });
      setPendingDeactivation(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      const code = errorStatus(cause);
      if (code === 401) setAccess('unauthenticated');
      setListError(userApiError(cause));
      setPendingDeactivation(null);
    } finally { setDeactivating(false); }
  }

  const formRoles = useMemo(() => {
    const options = [...selectableRoles];
    if (editing) {
      const currentRole = roles.find((role) => role.id === editing.role.id);
      if (currentRole && !options.some((role) => role.id === currentRole.id)) options.push(currentRole);
    }
    return options;
  }, [editing, roles, selectableRoles]);

  function renderActions(user: UserRecord) {
    const actions = userActions(actor ?? { id: '' }, user, actor?.permissions ?? []);
    return <div className="user-row-actions">
      <button type="button" className="icon-button" aria-label={`Xem ${user.name}`} title="Xem chi tiết" onClick={() => void openDetail(user)}><Icon name="info" /></button>
      {actions.canEdit && <button type="button" className="icon-button" aria-label={`Sửa ${user.name}`} title="Sửa người dùng" onClick={() => openEdit(user)}><Icon name="edit" /></button>}
      {actions.canActivate && <button type="button" className="icon-button user-activate-action" aria-label={`Kích hoạt ${user.name}`} title="Kích hoạt" onClick={() => void activate(user)}><Icon name="check" /></button>}
      {actions.canDeactivate && <button type="button" className="icon-button danger-icon-button" aria-label={`Vô hiệu hóa ${user.name}`} title="Vô hiệu hóa" onClick={() => setPendingDeactivation(user)}><Icon name="trash" /></button>}
    </div>;
  }

  function roleScope(user: UserRecord) {
    const role = roles.find((entry) => entry.id === user.role.id);
    const permissionCount = role?.permissions.length;
    return <span className="user-scope-cell"><strong>{role?.storeId === null ? 'Toàn hệ thống' : user.store.name}</strong>{permissionCount !== undefined && <small>{permissionCount} quyền theo Role</small>}</span>;
  }

  if (access === 'checking') return <main className="admin-shell"><section className="admin-card"><LoadingRows count={5} /></section></main>;
  if (access === 'unauthenticated') return <main className="admin-shell"><div className="admin-card"><p role="alert" className="notice-error">Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.</p><Link className="button-link" href="/">Đến trang đăng nhập</Link></div></main>;
  if (access === 'forbidden') return <main className="admin-shell"><section className="admin-card"><p role="alert" className="notice-error">Bạn không có quyền xem danh sách người dùng.</p><Link className="button-link" href="/">Quay lại</Link></section></main>;
  if (access === 'unsupported') return <main className="admin-shell"><section className="admin-card"><p role="alert" className="notice-error">{accessError}</p><Link className="button-link" href="/">Quay lại</Link></section></main>;
  if (access === 'error') return <main className="admin-shell"><section className="admin-card"><p role="alert" className="notice-error">{accessError}</p><button type="button" className="secondary-button" onClick={() => window.location.reload()}>Thử lại</button></section></main>;

  return <main className="admin-shell users-page">
    <div className="content-page-actions">
      {canShowMatrix && <button type="button" className="secondary-button" aria-expanded={matrixOpen} onClick={() => setMatrixOpen((value) => !value)}><Icon name="info" />{matrixOpen ? 'Ẩn ma trận quyền' : 'Ma trận quyền RBAC'}</button>}
      {canCreate && <button type="button" onClick={openCreate} disabled={!canReadRoles || roles.length === 0}><Icon name="plus" />Thêm người dùng</button>}
    </div>

    {accessError && <p role="status" className="notice-error">{accessError}</p>}
    {notice && <p role="status" aria-live="polite" className="notice-success">{notice}</p>}
    {listError && <p role="alert" className="notice-error">{listError}</p>}
    {excludedForeignUsers && <p role="alert" className="notice-error">Một số bản ghi ngoài cửa hàng hiện tại đã bị ẩn. Hãy kiểm tra cấu hình phân quyền API.</p>}

    <section className="admin-card users-list-card" aria-label="Danh sách người dùng">
      <div className="users-toolbar">
        <label className="users-search"><span className="sr-only">Tìm theo tên hoặc email</span><Icon name="search" size={17} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo tên hoặc email…" type="search" /></label>
        <label className="users-status-filter"><span className="sr-only">Lọc theo trạng thái</span><select aria-label="Lọc theo trạng thái" value={status} onChange={(event) => { setStatus(event.target.value as UsersQuery['status']); setPage(1); }}>
          <option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Đã vô hiệu hóa</option>
        </select></label>
        <span className="users-total">{pageResult.total} người dùng</span>
      </div>

      {listState === 'loading' ? <LoadingRows count={6} /> : listState === 'error'
        ? <EmptyState title="Không tải được danh sách người dùng" description="Kiểm tra kết nối rồi thử tải lại danh sách." action={<button type="button" className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}>Thử lại</button>} />
        : listState === 'empty' || listState === 'empty-search'
          ? <EmptyState title={listState === 'empty-search' ? 'Không tìm thấy người dùng phù hợp' : 'Chưa có người dùng'} description={listState === 'empty-search' ? 'Thử thay đổi từ khóa hoặc bộ lọc trạng thái.' : 'Tạo tài khoản nhân viên để bắt đầu quản lý quyền truy cập.'} action={canCreate && <button type="button" onClick={openCreate}><Icon name="plus" />Thêm người dùng</button>} />
        : <>
          <div className="table-wrap users-table-desktop"><table className="data-table users-table">
            <thead><tr><th>Người dùng</th><th>Vai trò</th><th>Phạm vi quyền</th><th>Trạng thái</th><th>Ngày cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>{visibleUsers.map((user) => <tr key={user.id}>
              <td><UserIdentity user={user} /></td><td><RoleBadge name={user.role.name} /></td><td>{roleScope(user)}</td>
              <td><StatusBadge value={user.status} label={user.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'} /></td>
              <td>{formatDate(user.updatedAt)}</td><td>{renderActions(user)}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="users-mobile-list">{visibleUsers.map((user) => <article className="user-mobile-card" key={user.id}>
            <div className="user-mobile-top"><UserIdentity user={user} /><StatusBadge value={user.status} label={user.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'} /></div>
            <div className="user-mobile-meta"><RoleBadge name={user.role.name} /><span>{user.store.name}</span><small>Cập nhật {formatDate(user.updatedAt)}</small></div>
            {renderActions(user)}
          </article>)}</div>
        </>}

      <div className="pagination-row users-pagination">
        <span className="users-result-count">{pageResult.total === 0 ? '0 kết quả' : `Hiển thị ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, pageResult.total)} / ${pageResult.total}`}</span>
        <button type="button" className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</button>
        <span aria-live="polite">Trang {page} / {maxPage}</span>
        <button type="button" className="secondary-button" disabled={page >= maxPage || loading} onClick={() => setPage((value) => Math.min(maxPage, value + 1))}>Sau</button>
      </div>
    </section>

    {matrixOpen && canShowMatrix && <section className="admin-card permission-matrix-card" aria-labelledby="permission-matrix-title">
      <div className="section-heading permission-matrix-heading"><div><h2 id="permission-matrix-title">Ma trận quyền RBAC</h2><p className="muted">Quyền đọc theo Role hiện có trong cửa hàng. Màn hình này không chỉnh sửa phân quyền.</p></div><span className="permission-principle"><Icon name="check" size={15} />Quyền thực tế được kiểm tra ở API</span></div>
      {permissions.length === 0 ? <EmptyState title="Chưa tải được danh mục quyền" description="Tài khoản cần permissions:read để xem ma trận." /> : <div className="table-wrap permission-matrix-scroll"><table className="data-table permission-matrix-table">
        <thead><tr><th>Mã quyền</th><th>Mô tả</th>{storeRoles.map((role) => <th key={role.id}><RoleBadge name={role.name} /></th>)}</tr></thead>
        <tbody>{permissionGroups.flatMap((group) => group.items.map((permission) => <tr key={permission.id}>
          <td><code>{permission.code}</code></td><td>{permission.description || '—'}</td>{storeRoles.map((role) => {
            const granted = role.permissions.some(({ permission: assigned }) => assigned.code === permission.code);
            return <td className="permission-check-cell" key={`${role.id}:${permission.id}`}><span className={granted ? 'permission-granted' : 'permission-not-granted'}>{granted ? 'Có' : '—'}</span></td>;
          })}</tr>))}</tbody>
      </table></div>}
    </section>}

    <Dialog open={formOpen} onClose={closeForm} title={editing ? 'Sửa người dùng' : 'Thêm người dùng'} description={editing ? 'Cập nhật thông tin và vai trò của tài khoản.' : 'Tài khoản mới sẽ thuộc cửa hàng hiện tại.'} footer={<>
      <button type="button" className="secondary-button" onClick={closeForm} disabled={saving}>Hủy</button>
      <button type="submit" form="user-form" disabled={saving || !formRoles.length}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo người dùng'}</button>
    </>}>
      <form id="user-form" className="form-grid user-form" onSubmit={(event) => void submitForm(event)}>
        {formError && <p role="alert" aria-live="polite" className="notice-error full">{formError}</p>}
        <label className="full">Họ và tên<input required minLength={1} maxLength={150} autoComplete="name" value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} /></label>
        <label className="full">Email<input required type="email" maxLength={255} autoComplete="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} /></label>
        {!editing && <label className="full">Mật khẩu ban đầu<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} /><small className="form-hint">Từ 12 đến 128 ký tự. Mật khẩu không được hiển thị lại sau khi tạo.</small></label>}
        <label className="full">Vai trò<select required value={form.roleId} onChange={(event) => setForm((previous) => ({ ...previous, roleId: event.target.value }))}>
          <option value="">Chọn vai trò</option>
          {formRoles.map((role) => <option key={role.id} value={role.id}>{role.name}{editing?.role.id === role.id && !selectableRoles.some((item) => item.id === role.id) ? ' (vai trò hiện tại)' : ''}</option>)}
        </select></label>
        {formRoles.length === 0 && <p className="field-error full">Không có Role phù hợp để gán cho tài khoản này.</p>}
        {editing && <p className="form-hint full">Đổi mật khẩu không thuộc phạm vi màn hình này.</p>}
      </form>
    </Dialog>

    <Dialog open={detailOpen} onClose={() => { setDetailOpen(false); setSelected(null); setDetailError(''); }} size="drawer" title={selected?.name ?? 'Chi tiết người dùng'} description={selected?.email ?? 'Thông tin tài khoản và quyền theo Role.'}>
      {detailLoading ? <LoadingRows count={5} /> : detailError ? <p role="alert" className="notice-error">{detailError}</p> : selected && <div className="user-detail-content">
        <div className="user-detail-hero"><span className="user-avatar user-avatar-large" aria-hidden="true">{initials(selected.name)}</span><div><h3>{selected.name}</h3><p>{selected.email}</p></div><StatusBadge value={selected.status} label={selected.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'} /></div>
        <dl className="detail-list user-detail-list"><div><dt>Vai trò</dt><dd><RoleBadge name={selected.role.name} /></dd></div><div><dt>Cửa hàng</dt><dd>{selected.store.name} <small>({selected.store.code})</small></dd></div><div><dt>Ngày tạo</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>Cập nhật gần nhất</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl>
        {canReadRoles && <section className="detail-section user-permission-preview"><h3>Quyền của Role</h3>{roles.find((role) => role.id === selected.role.id)?.permissions.length
          ? <ul>{roles.find((role) => role.id === selected.role.id)?.permissions.map(({ permission }) => <li key={permission.code}><code>{permission.code}</code><span>{permission.description || ''}</span></li>)}</ul>
          : <p className="muted">Role này chưa được cấp permission.</p>}</section>}
        <div className="button-row user-detail-actions">
          {userActions(actor ?? { id: '' }, selected, actor?.permissions ?? []).canEdit && <button type="button" className="secondary-button" onClick={() => { setDetailOpen(false); openEdit(selected); }}><Icon name="edit" />Sửa thông tin</button>}
          {userActions(actor ?? { id: '' }, selected, actor?.permissions ?? []).canActivate && <button type="button" onClick={() => void activate(selected)}><Icon name="check" />Kích hoạt</button>}
          {userActions(actor ?? { id: '' }, selected, actor?.permissions ?? []).canDeactivate && <button type="button" className="danger-button" onClick={() => { setDetailOpen(false); setPendingDeactivation(selected); }}><Icon name="trash" />Vô hiệu hóa</button>}
        </div>
      </div>}
    </Dialog>

    <Dialog open={Boolean(pendingDeactivation)} onClose={() => { if (!deactivating) setPendingDeactivation(null); }} title="Vô hiệu hóa người dùng?" description="Tài khoản sẽ không thể đăng nhập. Các phiên đang hoạt động sẽ bị thu hồi; dữ liệu lịch sử vẫn được giữ nguyên." footer={<>
      <button type="button" className="secondary-button" onClick={() => setPendingDeactivation(null)} disabled={deactivating}>Quay lại</button>
      <button type="button" className="danger-button" onClick={() => void deactivate()} disabled={deactivating}>{deactivating ? 'Đang xử lý…' : 'Vô hiệu hóa tài khoản'}</button>
    </>}>
      <p>Bạn xác nhận vô hiệu hóa tài khoản <strong>{pendingDeactivation?.name}</strong> ({pendingDeactivation?.email})?</p>
    </Dialog>
  </main>;
}
