'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { currentUser, getInventoryReport, getRevenueReport, getStoreConfig, getTopProductsReport } from '../../../lib/auth-client';
import type { CurrentUser } from '../../../lib/auth-client';
import { Icon } from '../../../components/ui/Icon';
import { InventoryCard } from '../../../components/reports/InventoryCard';
import { ReportFilter, type ReportRangePreset } from '../../../components/reports/ReportFilter';
import { RevenueChart } from '../../../components/reports/RevenueChart';
import { RevenueTable } from '../../../components/reports/RevenueTable';
import { ReportStatCard } from '../../../components/reports/ReportStatCard';
import { TopProductsCard } from '../../../components/reports/TopProductsCard';
import type { InventoryReport, RevenueReport, TopProductsReport } from '../../../components/reports/report-types';
import { formatReportCurrency } from '../../../components/reports/report-format';

type InventoryState = 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK';

function todayAt(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateDaysBefore(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

function getLoadError(error: unknown) {
  const status = getStatus(error);
  return status === 401 ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để xem báo cáo.'
    : status === 403 ? 'Tài khoản không có quyền xem báo cáo.'
      : 'Không tải được báo cáo. Kiểm tra kết nối rồi thử lại.';
}

export default function ReportsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState<ReportRangePreset>('today');
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('VND');
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [top, setTop] = useState<TopProductsReport | null>(null);
  const [inventory, setInventory] = useState<InventoryReport | null>(null);
  const [inventoryState, setInventoryState] = useState<InventoryState>('ALL');
  const [inventoryReloadKey, setInventoryReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [inventoryError, setInventoryError] = useState('');

  async function initialize() {
    setLoading(true);
    setError('');
    setRevenue(null);
    setTop(null);
    try {
      const [current, config] = await Promise.all([currentUser(), getStoreConfig()]);
      setUser(current);
      setTimezone(config.timezone);
      setCurrency(config.currency);
      document.title = `${config.name} · Báo cáo`;
      const today = todayAt(config.timezone);
      setFrom(today);
      setTo(today);
      setPreset('today');
      await loadRange(today, today);
    } catch (cause) {
      setError(getLoadError(cause));
      setLoading(false);
    }
  }

  async function loadRange(dateFrom: string, dateTo: string) {
    setLoading(true);
    setError('');
    setRevenue(null);
    setTop(null);
    try {
      const [sales, products] = await Promise.all([getRevenueReport(dateFrom, dateTo), getTopProductsReport(dateFrom, dateTo, 10)]);
      setRevenue(sales);
      setTop(products);
    } catch (cause) {
      setError(getLoadError(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void initialize(); }, []);

  useEffect(() => {
    if (!user?.permissions.includes('reports:read')) {
      setInventoryLoading(false);
      return;
    }
    let active = true;
    setInventoryLoading(true);
    setInventoryError('');
    setInventory((current) => current ? { ...current, items: [] } : null);
    getInventoryReport({ state: inventoryState, page: 1, limit: 50 }).then((result) => {
      if (active) setInventory(result);
    }).catch(() => {
      if (active) setInventoryError('Không tải được dữ liệu tồn kho.');
    }).finally(() => {
      if (active) setInventoryLoading(false);
    });
    return () => { active = false; };
  }, [inventoryState, inventoryReloadKey, user]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadRange(from, to);
  }

  function selectPreset(next: ReportRangePreset) {
    setPreset(next);
    if (next === 'custom') return;
    const end = todayAt(timezone);
    const start = next === '7-days' ? dateDaysBefore(end, 6) : next === '30-days' ? dateDaysBefore(end, 29) : end;
    setFrom(start);
    setTo(end);
    void loadRange(start, end);
  }

  function retryRange() {
    if (from && to && user) void loadRange(from, to);
    else void initialize();
  }

  const description = from && to ? `${from} – ${to}` : 'Đang lấy kỳ báo cáo';

  return <main className="admin-shell reports-page">
    <ReportFilter from={from} to={to} preset={preset} loading={loading}
      onFromChange={(value) => { setFrom(value); setPreset('custom'); }}
      onToChange={(value) => { setTo(value); setPreset('custom'); }}
      onPresetChange={selectPreset} onSubmit={apply} />

    {error && <div className="report-error" role="alert"><span className="report-error-icon"><Icon name="warning" size={18} /></span><span>{error}</span><button type="button" className="secondary-button" onClick={retryRange}>Thử lại</button></div>}

    <section className="report-kpis" aria-label="Chỉ số doanh thu" aria-busy={loading}>
      {loading ? Array.from({ length: 3 }, (_, index) => <div className="report-stat-skeleton" key={index} role="status" aria-label="Đang tải chỉ số"><span /><span /><span /></div>)
        : revenue && <>
          <ReportStatCard tone="revenue" title="Doanh thu ròng" value={formatReportCurrency(revenue.total, currency)} description={`Tổng doanh thu trong kỳ · ${description}`} icon="trend" />
          <ReportStatCard tone="sales" title="Bán hàng" value={formatReportCurrency(revenue.sales, currency)} description="Tổng tiền bán hàng ghi nhận" icon="receipt" />
          <ReportStatCard tone="refund" title="Hoàn tiền" value={formatReportCurrency(revenue.refunds, currency)} description="Tổng tiền đã hoàn trong kỳ" icon="refund" />
        </>}
    </section>

    <RevenueChart revenue={revenue} currency={currency} loading={loading} />
    <RevenueTable revenue={revenue} currency={currency} loading={loading} />

    <div className="report-bottom-grid">
      <TopProductsCard report={top} loading={loading} />
      <InventoryCard report={inventory} loading={inventoryLoading} error={inventoryError} state={inventoryState}
        onStateChange={setInventoryState} onRetry={() => setInventoryReloadKey((value) => value + 1)} />
    </div>
  </main>;
}
