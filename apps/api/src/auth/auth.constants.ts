export const AUTH_COOKIE = 'salesflow_auth';
export const AUTH_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export const PHASE_TWO_PERMISSIONS = [
  ['users:read', 'Read users'],
  ['users:create', 'Create users'],
  ['users:update', 'Update users'],
  ['users:delete', 'Deactivate users'],
  ['roles:read', 'Read roles'],
  ['permissions:read', 'Read permissions'],
  ['auth:me', 'Read current authenticated user'],
 ] as const;

export const STORE_CONFIGURATION_PERMISSIONS = [
  ['store:read', 'Read store configuration'],
  ['store:update', 'Update store configuration'],
  ['settings:read', 'Read store settings'],
  ['settings:update', 'Update store settings'],
  ['content:read', 'Read editable content blocks'],
  ['content:update', 'Update editable content blocks'],
  ['assets:upload', 'Upload store logo and favicon'],
  ['assets:delete', 'Delete store logo and favicon'],
] as const;

export const CATALOG_PERMISSIONS = [
  ['products:read', 'Read products'],
  ['products:create', 'Create products'],
  ['products:update', 'Update products'],
  ['products:delete', 'Delete or deactivate products'],
  ['categories:read', 'Read categories'],
  ['categories:create', 'Create categories'],
  ['categories:update', 'Update categories'],
  ['categories:delete', 'Delete or deactivate categories'],
] as const;

export const INVENTORY_PERMISSIONS = [
  ['inventory:read', 'Read inventory'],
  ['inventory:adjust', 'Adjust inventory'],
] as const;

export const CUSTOMER_PERMISSIONS = [
  ['customers:read', 'Read customers'],
  ['customers:create', 'Create customers'],
  ['customers:update', 'Update customers'],
  ['customers:delete', 'Delete or deactivate customers'],
] as const;

export const ORDER_PERMISSIONS = [
  ['orders:create', 'Create orders at POS'],
  ['orders:read', 'Read orders'],
  ['orders:update', 'Update order state through allowed operations'],
  ['orders:cancel', 'Cancel pending orders'],
  ['orders:refund', 'Refund completed orders'],
] as const;

export const REPORT_PERMISSIONS = [
  ['reports:read', 'Read store reports'],
] as const;

export const ALL_PERMISSIONS = [...PHASE_TWO_PERMISSIONS, ...STORE_CONFIGURATION_PERMISSIONS, ...CATALOG_PERMISSIONS, ...INVENTORY_PERMISSIONS, ...CUSTOMER_PERMISSIONS, ...ORDER_PERMISSIONS, ...REPORT_PERMISSIONS] as const;
