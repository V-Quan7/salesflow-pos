const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  role: { id: string; name: string };
  permissions: string[];
  store: { id: string; code: string; name: string };
}

export type UserStatus = 'ACTIVE' | 'INACTIVE';
export interface PermissionRecord { id: string; code: string; description: string | null; }
export interface RoleRecord {
  id: string;
  storeId: string | null;
  name: string;
  permissions: { permission: Pick<PermissionRecord, 'code' | 'description'> }[];
}
export interface UserRecord {
  id: string;
  storeId: string;
  name: string;
  email: string;
  status: UserStatus;
  role: { id: string; name: string; storeId: string | null };
  store: { id: string; code: string; name: string };
  createdAt: string;
  updatedAt: string;
}
export interface PaginatedUsers { items: UserRecord[]; total: number; page: number; limit: number; }
export interface UsersQuery { page?: number; limit?: number; search?: string; status?: UserStatus | ''; }
export interface CreateUserInput { name: string; email: string; password: string; roleId: string; }
export interface UpdateUserInput { name?: string; email?: string; roleId?: string; status?: UserStatus; }
export interface ApiError extends Error { status?: number; responseBody?: unknown; }

export interface PublicStoreConfig {
  store: { code: string; name: string; shortName: string; locale: string; logoUrl: string | null; faviconUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
  browserTitle: string;
  content: { key: string; title: string; content: string }[];
}

export interface StoreConfig {
  id: string; name: string; code: string; logoUrl: string | null; faviconUrl: string | null;
  slogan: string | null; description: string | null; phone: string | null; email: string | null;
  address: string | null; website: string | null; currency: string; timezone: string; locale: string;
  primaryColor: string | null; secondaryColor: string | null;
}

export interface StoreSetting { key: string; value: string; valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'; description: string | null; updatedAt: string | null; }
export interface ContentBlock { key: string; title: string; content: string; type: string; isActive: boolean; updatedAt: string | null; }
export interface CatalogCategory {
  id: string; storeId: string; name: string; slug: string; description: string | null;
  status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string; _count?: { products: number };
}
export interface CatalogProduct {
  id: string; storeId: string; categoryId: string; sku: string; barcode: string | null; name: string; description: string | null;
  imageUrl: string | null; costPrice: string; sellingPrice: string; unit: string; stockQuantity: number;
  minStock: number; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string;
  category: Pick<CatalogCategory, 'id' | 'name' | 'slug' | 'status'>;
}
export interface CatalogPage<T> { items: T[]; total: number; page: number; limit: number; }
export interface CatalogQuery {
  page?: number; limit?: number; search?: string; status?: 'ACTIVE' | 'INACTIVE';
  categoryId?: string; sortBy?: string; order?: 'asc' | 'desc';
}
export interface CategoryInput { name: string; slug: string; description?: string; status?: 'ACTIVE' | 'INACTIVE'; }
export interface ProductInput {
  sku: string; barcode?: string | null; name: string; description?: string; categoryId: string; costPrice: string;
  sellingPrice: string; unit: string; stockQuantity: number; minStock: number; status?: 'ACTIVE' | 'INACTIVE';
}
export interface ProductImportRowError { row: number; column: string; message: string; }
export interface ProductImportPreviewRow {
  row: number; sku: string; barcode: string; name: string; categorySlug: string; categoryName: string;
  unit: string; costPrice: string; sellingPrice: string; minStock: number; status: 'ACTIVE' | 'INACTIVE';
  openingStock: number; description: string; errors: ProductImportRowError[];
}
export interface ProductImportPreview {
  totalRows: number; validRows: number; errorRows: number; errors: ProductImportRowError[]; rows: ProductImportPreviewRow[];
}
export type ProductUpdateInput = Omit<Partial<ProductInput>, 'stockQuantity'> & { removeImage?: boolean };
export interface InventoryItem extends CatalogProduct { lowStock: boolean; }
export interface InventoryQuery {
  page?: number; limit?: number; search?: string; status?: 'ACTIVE' | 'INACTIVE'; lowStock?: boolean;
  sortBy?: 'sku' | 'name' | 'stockQuantity' | 'minStock' | 'updatedAt'; order?: 'asc' | 'desc';
}
export interface InventoryTransaction {
  id: string; type: 'IN' | 'SALE' | 'ADJUSTMENT'; quantity: number; beforeQuantity: number; afterQuantity: number;
  referenceType: 'ORDER' | 'ADJUSTMENT' | 'MANUAL'; referenceId: string; note: string | null;
  createdBy: string; createdAt: string; creator: { id: string; name: string };
}
export interface CustomerRecord {
  id: string; storeId: string; name: string; phone: string | null; email: string | null; address: string | null;
  note: string | null; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string;
}
export interface CustomerInput { name: string; phone?: string | null; email?: string | null; address?: string | null; note?: string | null; status?: 'ACTIVE' | 'INACTIVE'; }
export interface CustomerOrder {
  id: string; orderCode: string; subtotal: string; discount: string; total: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET'; paymentStatus: string; orderStatus: string; createdAt: string;
  items: { productNameSnapshot: string; skuSnapshot: string; quantity: number; unitPrice: string; discount: string; total: string }[];
}
export interface CustomerHistory {
  customer: Pick<CustomerRecord, 'id' | 'name' | 'phone' | 'email' | 'status'>;
  summary: { totalOrders: number; totalPurchaseAmount: string };
  orders: CatalogPage<CustomerOrder>;
}
export interface PosProduct {
  id: string; sku: string; name: string; sellingPrice: string; unit: string; stockQuantity: number;
  status: 'ACTIVE' | 'INACTIVE'; imageUrl: string | null; category: { id: string; name: string };
}
export interface PosProductPage extends CatalogPage<PosProduct> { currency: string; }
export interface CreateOrderInput {
  customerId?: string; items: { productId: string; quantity: number }[]; discount?: string;
  discountType?: 'FIXED' | 'PERCENTAGE'; discountValue?: string; amountReceived?: string; manualPaymentConfirmed?: boolean;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET';
}
export interface OrderReceiptStore {
  name: string; logoUrl: string | null; address: string | null; phone: string | null;
  currency: string; timezone: string; locale: string;
}
export interface CreatedOrder {
  id: string; orderCode: string; subtotal: string; discount: string; discountType: 'FIXED' | 'PERCENTAGE'; discountValue: string; total: string;
  amountReceived: string | null; changeAmount: string | null;
  paymentMethod: CreateOrderInput['paymentMethod']; paymentStatus: string; orderStatus: string;
  createdAt: string; customer: { id: string; name: string; phone: string | null } | null;
  staff: { id: string; name: string }; store: OrderReceiptStore;
  items: { id: string; productNameSnapshot: string; skuSnapshot: string; quantity: number; unitPrice: string; discount: string; total: string }[];
}
export interface OrderRecord {
  id: string; orderCode: string; subtotal: string; discount: string; total: string;
  discountType?: 'FIXED' | 'PERCENTAGE'; discountValue?: string; amountReceived?: string | null; changeAmount?: string | null;
  paymentMethod: CreateOrderInput['paymentMethod']; paymentStatus: string; orderStatus: string;
  createdAt: string; updatedAt: string;
  customer: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  staff: { id: string; name: string; email?: string };
  store?: OrderReceiptStore;
  items?: { id: string; productNameSnapshot: string; skuSnapshot: string; quantity: number; unitPrice: string; discount: string; total: string }[];
  refundedAt?: string | null; refundReason?: string | null;
  auditEvents?: { action: string; reason: string; createdAt: string; actor: { id: string; name: string } }[];
}
export interface OrderDetailRecord extends OrderRecord {
  discountType: 'FIXED' | 'PERCENTAGE'; discountValue: string;
  amountReceived: string | null; changeAmount: string | null;
  store: OrderReceiptStore;
  items: NonNullable<OrderRecord['items']>;
}
export interface OrderQuery {
  page?: number; limit?: number; search?: string; status?: string; paymentStatus?: string;
  paymentMethod?: CreateOrderInput['paymentMethod']; customerId?: string; dateFrom?: string; dateTo?: string;
  sort?: 'createdAt' | 'updatedAt' | 'orderCode' | 'total'; order?: 'asc' | 'desc';
}
export interface DashboardReport {
  date: string; timezone: string; revenueToday: string; ordersToday: number; productsSoldToday: number;
  lowStockProducts: number;
  recentOrders: Pick<OrderRecord, 'id' | 'orderCode' | 'total' | 'orderStatus' | 'paymentStatus' | 'createdAt' | 'customer'>[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'Unauthenticated' : response.status === 403 ? 'Forbidden' : 'Request failed');
    let responseBody: unknown;
    try { responseBody = await response.json(); } catch { /* Some error responses have no JSON body. */ }
    Object.assign(error, { status: response.status, responseBody });
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(input: { storeCode: string; email: string; password: string }) {
  return request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}
export function currentUser() { return request<CurrentUser>('/auth/me'); }
export function logout() { return request<{ success: true }>('/auth/logout', { method: 'POST' }); }

export function getUsers(query: UsersQuery = {}) {
  return request<PaginatedUsers>(`/users${queryString(query)}`);
}
export function getUser(id: string) { return request<UserRecord>(`/users/${encodeURIComponent(id)}`); }
export function createUser(input: CreateUserInput) {
  return request<UserRecord>('/users', { method: 'POST', body: JSON.stringify(input) });
}
export function updateUser(id: string, input: UpdateUserInput) {
  return request<UserRecord>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deactivateUser(id: string) {
  return request<UserRecord>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function getRoles() { return request<RoleRecord[]>('/roles'); }
export function getPermissions() { return request<PermissionRecord[]>('/permissions'); }

export function publicStoreConfig(storeCode: string) {
  return request<PublicStoreConfig>(`/store/public-config/${encodeURIComponent(storeCode)}`);
}
export function getStoreConfig() { return request<StoreConfig>('/store'); }
export function updateStoreConfig(input: Partial<Omit<StoreConfig, 'id'>>) {
  return request<StoreConfig>('/store', { method: 'PATCH', body: JSON.stringify(input) });
}
export function getStoreSettings() { return request<StoreSetting[]>('/store/settings'); }
export function updateStoreSettings(settings: Record<string, string>) {
  return request<StoreSetting[]>('/store/settings', { method: 'PATCH', body: JSON.stringify({ settings }) });
}
export function getContentBlocks() { return request<ContentBlock[]>('/store/content'); }
export function updateContentBlock(key: string, input: Pick<ContentBlock, 'title' | 'content' | 'isActive'>) {
  return request<ContentBlock>(`/store/content/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) });
}
export function resetContentBlock(key: string) {
  return request<ContentBlock>(`/store/content/${encodeURIComponent(key)}/reset`, { method: 'POST' });
}
export function uploadStoreAsset(kind: 'logo' | 'favicon', file: File): Promise<{ logoUrl?: string | null; faviconUrl?: string | null }> {
  const form = new FormData(); form.set('file', file);
  return fetch(`${API_BASE}/store/${kind}`, { method: 'POST', credentials: 'include', body: form }).then(async (response) => {
    if (!response.ok) throw Object.assign(new Error('Upload failed'), { status: response.status });
    return response.json();
  });
}
export function deleteStoreAsset(kind: 'logo' | 'favicon') {
  return request<{ logoUrl?: null; faviconUrl?: null }>(`/store/${kind}`, { method: 'DELETE' });
}

function queryString(query: object = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : '';
}

export function getCategories(query: CatalogQuery = {}) {
  return request<CatalogPage<CatalogCategory>>(`/categories${queryString(query)}`);
}
export function createCategory(input: CategoryInput) {
  return request<CatalogCategory>('/categories', { method: 'POST', body: JSON.stringify(input) });
}
export function updateCategory(id: string, input: Partial<CategoryInput>) {
  return request<CatalogCategory>(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteCategory(id: string) {
  return request<CatalogCategory & { deleted?: boolean; deactivated?: boolean }>(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getProducts(query: CatalogQuery = {}) {
  return request<CatalogPage<CatalogProduct>>(`/products${queryString(query)}`);
}
export function getProduct(id: string) {
  return request<CatalogProduct>(`/products/${encodeURIComponent(id)}`);
}
async function saveProduct<T>(path: string, method: 'POST' | 'PATCH', input: Partial<ProductInput> & { removeImage?: boolean }, image?: File) {
  if (!image && !input.removeImage) return request<T>(path, { method, body: JSON.stringify(input) });
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) form.set(key, String(value));
  }
  if (image) form.set('image', image);
  const response = await fetch(`${API_BASE}${path}`, { method, credentials: 'include', body: form });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Unauthenticated' : response.status === 403 ? 'Forbidden' : 'Request failed'), { status: response.status });
  return response.json() as Promise<T>;
}
export function createProduct(input: ProductInput, image?: File) {
  return saveProduct<CatalogProduct>('/products', 'POST', input, image);
}
export function updateProduct(id: string, input: ProductUpdateInput, image?: File) {
  return saveProduct<CatalogProduct>(`/products/${encodeURIComponent(id)}`, 'PATCH', input, image);
}
export async function downloadProductImportTemplate(): Promise<Blob> {
  const response = await fetch(`${API_BASE}/products/import/template`, { credentials: 'include' });
  if (!response.ok) throw await productImportHttpError(response);
  return response.blob();
}
export async function previewProductImport(file: File): Promise<ProductImportPreview> {
  return uploadProductImport('/products/import/preview', file);
}
export async function confirmProductImport(file: File): Promise<{ createdCount: number }> {
  return uploadProductImport('/products/import', file);
}
async function uploadProductImport<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.set('file', file);
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', credentials: 'include', body: form });
  if (!response.ok) throw await productImportHttpError(response);
  return response.json() as Promise<T>;
}
async function productImportHttpError(response: Response) {
  const responseBody = await response.json().catch(() => undefined);
  const message = typeof responseBody?.message === 'string' ? responseBody.message : 'Product import request failed';
  return Object.assign(new Error(message), { status: response.status, responseBody });
}
export function getInventory(query: InventoryQuery = {}) {
  return request<CatalogPage<InventoryItem>>(`/inventory${queryString(query)}`);
}
export function adjustInventory(input: { productId: string; quantity: number; note?: string }) {
  return request<{ productId: string; stockQuantity: number; transaction: InventoryTransaction }>('/inventory/adjust', {
    method: 'POST', body: JSON.stringify(input),
  });
}
export function getInventoryHistory(productId: string, query: { page?: number; limit?: number; order?: 'asc' | 'desc' } = {}) {
  return request<CatalogPage<InventoryTransaction>>(`/inventory/${encodeURIComponent(productId)}/history${queryString(query)}`);
}
export function getCustomers(query: CatalogQuery = {}) {
  return request<CatalogPage<CustomerRecord>>(`/customers${queryString(query)}`);
}
export function getCustomer(id: string) { return request<CustomerRecord>(`/customers/${encodeURIComponent(id)}`); }
export function createCustomer(input: CustomerInput) {
  return request<CustomerRecord>('/customers', { method: 'POST', body: JSON.stringify(input) });
}
export function updateCustomer(id: string, input: Partial<CustomerInput>) {
  return request<CustomerRecord>(`/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteCustomer(id: string) {
  return request<CustomerRecord & { deleted?: boolean; deactivated?: boolean }>(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function getCustomerHistory(id: string, query: { page?: number; limit?: number } = {}) {
  return request<CustomerHistory>(`/customers/${encodeURIComponent(id)}/history${queryString(query)}`);
}
export function getPosProducts(query: { page?: number; limit?: number; search?: string } = {}) {
  return request<PosProductPage>(`/products/pos${queryString(query)}`);
}
export function getPosProductByBarcode(barcode: string) {
  return request<PosProduct>(`/products/pos/lookup${queryString({ barcode: barcode.trim() })}`);
}
export function createOrder(input: CreateOrderInput) {
  return request<CreatedOrder>('/orders', { method: 'POST', body: JSON.stringify(input) });
}
function orderQueryString(query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if ((typeof value === 'string' || typeof value === 'number') && value !== '') params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : '';
}
export function getOrders(query: OrderQuery = {}) {
  return request<CatalogPage<OrderRecord>>(`/orders${orderQueryString(query)}`);
}
export function getOrder(id: string) { return request<OrderDetailRecord>(`/orders/${encodeURIComponent(id)}`); }
export function updateOrderStatus(id: string, status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED', reason?: string) {
  return request<{ id: string; orderStatus: string; paymentStatus: string; refundedAt?: string }>(`/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });
}
export function cancelOrder(id: string, reason: string) {
  return request<{ id: string; orderStatus: string; paymentStatus: string }>(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export function refundOrder(id: string, reason: string) {
  return request<{ id: string; orderStatus: string; paymentStatus: string; refundedAt: string }>(`/orders/${encodeURIComponent(id)}/refund`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export function getDashboardReport() { return request<DashboardReport>('/reports/dashboard'); }
export function getRevenueReport(dateFrom: string, dateTo: string) {
  return request<{ timezone: string; dateFrom: string; dateTo: string; sales: string; refunds: string; total: string; daily: { date: string; sales: string; refunds: string; netRevenue: string }[] }>(`/reports/revenue${orderQueryString({ dateFrom, dateTo })}`);
}
export function getTopProductsReport(dateFrom: string, dateTo: string, limit = 10) {
  return request<{ timezone: string; dateFrom: string; dateTo: string; items: { productNameSnapshot: string; skuSnapshot: string; quantity: number }[] }>(`/reports/top-products${orderQueryString({ dateFrom, dateTo, limit })}`);
}
export function getInventoryReport(query: { state?: 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK'; page?: number; limit?: number } = {}) {
  return request<{ summary: { productCount: number; lowStockProducts: number; outOfStockProducts: number }; items: { id: string; sku: string; name: string; stockQuantity: number; minStock: number; unit: string; category: { id: string; name: string } }[]; total: number; page: number; limit: number }>(`/reports/inventory${orderQueryString(query)}`);
}
export function deleteProduct(id: string) {
  return request<CatalogProduct & { deleted?: boolean; deactivated?: boolean }>(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export { request };
