'use client';

import { useEffect, useState } from 'react';
import { getDashboardReport, getStoreConfig } from '../../lib/auth-client';
import type { DashboardReport } from '../../lib/auth-client';
import { EmptyState, LoadingRows } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';
import { StatusBadge } from '../../components/ui/StatusBadge';

export default function DashboardPage() {
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboardReport().then(async (data) => {
      const config = await getStoreConfig().catch(() => null);
      setReport(data);
      if (config) document.title = config.name;
    }).catch((cause) => setError(getStatus(cause) === 403 ? 'Tài khoản không có quyền xem bảng điều khiển.' : 'Hãy đăng nhập để xem bảng điều khiển.'))
      .finally(() => setLoading(false));
  }, []);

  return <main className="admin-shell">
    {error && <p role="alert" className="notice-error">{error}</p>}
    {loading ? <><section className="catalog-grid">{Array.from({ length: 4 }, (_, index) => <div className="admin-card" key={index}><span className="skeleton-row" /></div>)}</section><section className="admin-card"><LoadingRows count={5} /></section></> : report && <>
      <section className="catalog-grid">
        <Metric icon="trend" title="Doanh thu hôm nay" value={report.revenueToday} detail={`${report.date} · ${report.timezone}`} />
        <Metric icon="receipt" title="Đơn hoàn tất hôm nay" value={String(report.ordersToday)} />
        <Metric icon="box" title="Sản phẩm đã bán hôm nay" value={String(report.productsSoldToday)} />
        <Metric icon="warning" title="Sản phẩm sắp hết" value={String(report.lowStockProducts)} tone={report.lowStockProducts > 0 ? 'warning' : undefined} />
      </section>
      <section className="admin-card"><div className="catalog-toolbar"><div><h2>Đơn hàng gần đây</h2><p className="muted">Các giao dịch mới nhất trong cửa hàng.</p></div></div>
        {report.recentOrders.length === 0 ? <EmptyState title="Chưa có đơn hàng" description="Đơn bán hàng mới sẽ xuất hiện tại đây." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Ngày</th><th>Tổng</th><th>Trạng thái</th></tr></thead><tbody>{report.recentOrders.map((order) => <tr key={order.id}><td><strong>{order.orderCode}</strong></td><td>{order.customer?.name ?? 'Khách lẻ'}</td><td>{new Date(order.createdAt).toLocaleString('vi-VN', { timeZone: report.timezone })}</td><td className="numeric"><strong>{order.total}</strong></td><td><StatusBadge value={order.orderStatus} /></td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </main>;
}

function Metric({ icon, title, value, detail, tone }: { icon: 'trend' | 'receipt' | 'box' | 'warning'; title: string; value: string; detail?: string; tone?: 'warning' }) {
  return <section className={`admin-card metric-card${tone ? ` metric-${tone}` : ''}`}><div className="metric-card-top"><span className="metric-icon"><Icon name={icon} size={18} /></span>{tone && <StatusBadge value="LOW_STOCK" label="Cần chú ý" />}</div><p className="muted">{title}</p><strong className="metric-value">{value}</strong>{detail && <p className="metric-detail">{detail}</p>}</section>;
}
function getStatus(error: unknown): number | undefined { return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined; }
