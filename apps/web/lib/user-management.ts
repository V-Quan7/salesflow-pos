import type { CreateUserInput, PermissionRecord, RoleRecord, UpdateUserInput, UserRecord, UserStatus, UsersQuery } from './auth-client';

export function hasPermission(permissions: readonly string[], required: string): boolean {
  return permissions.includes(required);
}

export function isRoleAssignable(role: RoleRecord, storeId: string, permissions: readonly string[]): boolean {
  return role.storeId === storeId && role.permissions.every(({ permission }) => permissions.includes(permission.code));
}

export function assignableRoles(roles: readonly RoleRecord[], storeId: string, permissions: readonly string[]): RoleRecord[] {
  return roles.filter((role) => isRoleAssignable(role, storeId, permissions));
}

export function userActions(actor: Pick<UserRecord, 'id'>, target: Pick<UserRecord, 'id' | 'status'>, permissions: readonly string[]) {
  return {
    canEdit: hasPermission(permissions, 'users:update'),
    canActivate: target.status === 'INACTIVE' && hasPermission(permissions, 'users:update'),
    canDeactivate: target.status === 'ACTIVE' && target.id !== actor.id && hasPermission(permissions, 'users:delete'),
  };
}

export function groupPermissions(permissions: readonly PermissionRecord[]) {
  const groups = new Map<string, PermissionRecord[]>();
  for (const permission of permissions) {
    const group = permission.code.split(':', 1)[0] || 'other';
    groups.set(group, [...(groups.get(group) ?? []), permission]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, items]) => ({ name, items }));
}

export function buildUsersQuery(page: number, limit: number, search: string, status: UsersQuery['status']): UsersQuery {
  return { page, limit, ...(search ? { search } : {}), ...(status ? { status } : {}) };
}

export function buildCreateUserInput(form: CreateUserInput): CreateUserInput {
  return { name: form.name.trim(), email: form.email.trim(), password: form.password, roleId: form.roleId };
}

export function buildUpdateUserInput(form: Pick<CreateUserInput, 'name' | 'email' | 'roleId'>, currentRoleId: string): UpdateUserInput {
  return { name: form.name.trim(), email: form.email.trim(), ...(form.roleId !== currentRoleId ? { roleId: form.roleId } : {}) };
}

export function userListState(loading: boolean, error: string, items: readonly UserRecord[], search: string, status: string) {
  if (loading) return 'loading' as const;
  if (error) return 'error' as const;
  if (items.length) return 'results' as const;
  if (search || status) return 'empty-search' as const;
  return 'empty' as const;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1 ? parts[0].slice(0, 1).toLocaleUpperCase() : `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase();
}

export function userApiError(cause: unknown): string {
  const status = typeof cause === 'object' && cause !== null && 'status' in cause
    ? Number((cause as { status?: unknown }).status)
    : undefined;
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Người dùng không còn tồn tại hoặc không thuộc cửa hàng này.';
  if (status === 409) return 'Email này đã được sử dụng trong cửa hàng.';
  if (status === 400 || status === 422) return 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các trường đã nhập.';
  if (status === 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

export function isUserStatus(value: string): value is UserStatus {
  return value === 'ACTIVE' || value === 'INACTIVE';
}

export function isTargetInCurrentStore(user: UserRecord, currentStoreId: string): boolean {
  return user.storeId === currentStoreId;
}
