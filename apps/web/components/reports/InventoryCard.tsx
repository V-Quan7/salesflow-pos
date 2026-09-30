import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/Icon';
import type { InventoryReport } from './report-types';

type InventoryCardProps = {
  report: InventoryReport | null;
  loading: boolean;
  error: string;
  state: 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  onStateChange: (state: InventoryCardProps['state']) => void;
  onRetry: () => void;
};

export function InventoryCard({ report, loading, error, state, onStateChange, onRetry }: InventoryCardProps) {
  return <section className="admin-card report-panel report-bottom-panel" aria-labelledby="report-inventory-title" aria-busy={loading}>
    <div className="report-section-heading report-inventory-heading"><div><span className="report-panel-icon report-icon-inventory"><Icon name="inventory" /></span><div><h2 id="report-inventory-title">Tồn kho hiện tại</h2><p className="muted">Tình trạng hàng hóa trong cửa hàng</p></div></div>
      <label className="report-inventory-filter"><span className="sr-only">Lọc tồn kho</span><select value={state} onChange={(event) => onStateChange(event.target.value as InventoryCardProps['state'])}><option value="ALL">Tất cả</option><option value="LOW_STOCK">Sắp hết</option><option value="OUT_OF_STOCK">Hết hàng</option></select></label>
    </div>
    {report && <div className="report-inventory-summary" aria-label="Tóm tắt tồn kho">
      <div><span>Tổng sản phẩm</span><strong>{report.summary.productCount.toLocaleString('vi-VN')}</strong></div>
      <div className="warning"><span>Sắp hết</span><strong>{report.summary.lowStockProducts.toLocaleString('vi-VN')}</strong></div>
      <div className="danger"><span>Hết hàng</span><strong>{report.summary.outOfStockProducts.toLocaleString('vi-VN')}</strong></div>
    </div>}
    {loading && !report && <div className="report-inventory-summary report-summary-skeleton" aria-hidden="true"><span /><span /><span /></div>}
    {error && <div className="report-inline-error" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={onRetry}>Thử lại</button></div>}
    {loading ? <div className="report-inventory-skeleton" role="status" aria-label="Đang tải tồn kho"><span /><span /><span /></div>
      : error ? <p className="report-inventory-error-space">Hãy thử tải lại để xem danh sách tồn kho.</p>
      : !report?.items.length ? <EmptyState title="Không có sản phẩm phù hợp" description="Không tìm thấy dữ liệu tồn kho theo bộ lọc này." />
        : <div className="table-wrap report-table-wrap report-inventory-table-wrap"><table className="data-table report-inventory-table"><thead><tr><th>Sản phẩm</th><th>Tồn</th><th>Tối thiểu</th><th>Trạng thái</th></tr></thead><tbody>
          {report.items.map((item) => {
            const outOfStock = item.stockQuantity === 0;
            const lowStock = !outOfStock && item.stockQuantity <= item.minStock;
            const status = outOfStock ? 'Hết hàng' : lowStock ? 'Sắp hết' : 'Còn hàng';
            return <tr key={item.id}><td><strong>{item.name}</strong><small><code>{item.sku}</code><span> · {item.category.name}</span></small></td><td className="numeric"><strong>{item.stockQuantity.toLocaleString('vi-VN')}</strong><small>{item.unit}</small></td><td className="numeric">{item.minStock.toLocaleString('vi-VN')}<small>{item.unit}</small></td><td><span className={`status-badge report-stock-badge ${outOfStock ? 'status-danger' : lowStock ? 'status-warning' : 'status-success'}`}>{status}</span></td></tr>;
          })}
        </tbody></table></div>}
  </section>;
}
