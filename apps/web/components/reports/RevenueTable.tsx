import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/Icon';
import type { RevenueReport } from './report-types';
import { formatReportCurrency, formatReportDate } from './report-format';

type RevenueTableProps = { revenue: RevenueReport | null; currency: string; loading: boolean };

export function RevenueTable({ revenue, currency, loading }: RevenueTableProps) {
  return <section className="admin-card report-panel report-table-panel" aria-labelledby="report-revenue-table-title" aria-busy={loading}>
    <div className="report-section-heading"><div><span className="report-panel-icon report-icon-sales"><Icon name="receipt" /></span><div><h2 id="report-revenue-table-title">Doanh thu chi tiết</h2><p className="muted">Đối soát tiền bán và hoàn trả theo ngày</p></div></div></div>
    {loading ? <div className="report-table-skeleton" role="status" aria-label="Đang tải doanh thu"><span /><span /><span /><span /></div>
      : !revenue?.daily.length ? <EmptyState title="Chưa có dữ liệu trong khoảng thời gian này" />
        : <div className="table-wrap report-table-wrap"><table className="data-table report-revenue-table"><thead><tr><th>Ngày</th><th className="numeric">Bán hàng</th><th className="numeric">Hoàn tiền</th><th className="numeric">Doanh thu ròng</th></tr></thead><tbody>
          {revenue.daily.map((day) => <tr key={day.date}><td><strong>{formatReportDate(day.date)}</strong></td><td className="numeric">{formatReportCurrency(day.sales, currency)}</td><td className="numeric report-refund-value">{formatReportCurrency(day.refunds, currency)}</td><td className="numeric"><strong>{formatReportCurrency(day.netRevenue, currency)}</strong></td></tr>)}
        </tbody><tfoot><tr><th scope="row">Tổng kỳ</th><td className="numeric">{formatReportCurrency(revenue.sales, currency)}</td><td className="numeric report-refund-value">{formatReportCurrency(revenue.refunds, currency)}</td><td className="numeric"><strong>{formatReportCurrency(revenue.total, currency)}</strong></td></tr></tfoot></table></div>}
  </section>;
}

