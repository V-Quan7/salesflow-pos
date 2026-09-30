import type { getInventoryReport, getRevenueReport, getTopProductsReport } from '../../lib/auth-client';

export type RevenueReport = Awaited<ReturnType<typeof getRevenueReport>>;
export type TopProductsReport = Awaited<ReturnType<typeof getTopProductsReport>>;
export type InventoryReport = Awaited<ReturnType<typeof getInventoryReport>>;

