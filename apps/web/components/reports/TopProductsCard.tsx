import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/Icon';
import type { TopProductsReport } from './report-types';

type TopProductsCardProps = { report: TopProductsReport | null; loading: boolean };

export function TopProductsCard({ report, loading }: TopProductsCardProps) {
  const maxQuantity = Math.max(1, ...(report?.items.map((item) => item.quantity) ?? []));
  return <section className="admin-card report-panel report-bottom-panel" aria-labelledby="report-top-products-title" aria-busy={loading}>
    <div className="report-section-heading"><div><span className="report-panel-icon report-icon-products"><Icon name="products" /></span><div><h2 id="report-top-products-title">Sản phẩm bán chạy</h2><p className="muted">Xếp hạng theo số lượng đã bán</p></div></div></div>
    {loading ? <div className="report-ranking-skeleton" role="status" aria-label="Đang tải sản phẩm bán chạy">{Array.from({ length: 4 }, (_, index) => <div key={index}><span /><span /></div>)}</div>
      : !report?.items.length ? <EmptyState title="Chưa có dữ liệu sản phẩm" description="Không có giao dịch phù hợp trong khoảng thời gian này." />
        : <ol className="report-ranking-list">{report.items.map((item, index) => <li className="report-ranking-item" key={`${item.skuSnapshot}-${item.productNameSnapshot}`}>
          <span className={`report-ranking-number${index < 3 ? ' top-three' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
          <div className="report-ranking-content"><div className="report-ranking-title"><strong title={item.productNameSnapshot}>{item.productNameSnapshot}</strong><span>{item.quantity.toLocaleString('vi-VN')} đã bán</span></div><code>{item.skuSnapshot}</code><span className="report-ranking-track" aria-label={`${item.quantity} sản phẩm đã bán`} role="img"><i style={{ width: `${item.quantity / maxQuantity * 100}%` }} /></span></div>
        </li>)}</ol>}
  </section>;
}

