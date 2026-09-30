'use client';

import { useId, useState, type CSSProperties } from 'react';
import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/Icon';
import type { RevenueReport } from './report-types';
import { formatCompactReportCurrency, formatReportCurrency, formatReportDate } from './report-format';

type RevenueChartProps = { revenue: RevenueReport | null; currency: string; loading: boolean };
type ChartPoint = { x: number; y: number; amount: number; date: string; value: string };

const chartWidth = 1000;
const chartHeight = 340;
const plot = { left: 86, right: 24, top: 22, bottom: 54 };

export function RevenueChart({ revenue, currency, loading }: RevenueChartProps) {
  const gradientId = useId();
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null);
  const rows = revenue?.daily ?? [];

  if (loading) return <section className="admin-card report-panel report-chart-panel" aria-label="Biểu đồ doanh thu đang tải" aria-busy="true"><div className="report-section-heading"><div><span className="report-panel-icon report-icon-revenue"><Icon name="trend" /></span><div><h2>Doanh thu theo ngày</h2><p className="muted">Diễn biến doanh thu ròng trong kỳ</p></div></div></div><div className="report-chart-skeleton"><span /><span /><span /><span /></div></section>;

  const points = makePoints(rows);
  const tickValues = getTickValues(points.map(({ amount }) => amount));
  const linePath = makeLinePath(points);
  const zeroY = scaleY(0, points.map(({ amount }) => amount));
  const areaPath = points.length ? `${linePath} L ${points.at(-1)!.x} ${zeroY} L ${points[0].x} ${zeroY} Z` : '';
  const xLabels = getLabelPoints(points);

  return <section className="admin-card report-panel report-chart-panel" aria-labelledby="report-revenue-chart-title">
    <div className="report-section-heading"><div><span className="report-panel-icon report-icon-revenue"><Icon name="trend" /></span><div><h2 id="report-revenue-chart-title">Doanh thu theo ngày</h2><p className="muted">Doanh thu ròng · {revenue?.timezone ?? 'Múi giờ cửa hàng'}</p></div></div>
      {rows.length > 0 && <span className="report-data-count">{rows.length} {rows.length === 1 ? 'ngày có dữ liệu' : 'ngày có dữ liệu'}</span>}
    </div>
    {!points.length ? <EmptyState title="Chưa có dữ liệu trong khoảng thời gian này" description="Thử chọn một khoảng ngày khác để xem doanh thu." /> : <>
      {points.length === 1 && <p className="report-limited-note"><Icon name="info" size={15} />Chỉ có dữ liệu cho {formatReportDate(points[0].date)} trong kỳ đã chọn.</p>}
      <div className="report-chart-wrap" onMouseLeave={() => setActivePoint(null)}>
        <svg className="report-revenue-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="group" aria-label={`Biểu đồ doanh thu ròng với ${points.length} ngày có dữ liệu`}>
          <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" className="report-chart-gradient-top" /><stop offset="100%" className="report-chart-gradient-bottom" /></linearGradient></defs>
          {tickValues.map((value, index) => {
            const y = plot.top + index * ((chartHeight - plot.top - plot.bottom) / Math.max(1, tickValues.length - 1));
            return <g key={`${value}-${index}`}><line className="report-chart-gridline" x1={plot.left} x2={chartWidth - plot.right} y1={y} y2={y} /><text className="report-chart-axis-label" x={plot.left - 12} y={y + 4} textAnchor="end">{formatCompactReportCurrency(value, currency)}</text></g>;
          })}
          <line className="report-chart-zero-line" x1={plot.left} x2={chartWidth - plot.right} y1={zeroY} y2={zeroY} />
          <path d={areaPath} fill={`url(#${gradientId})`} />
          {points.length > 1 && <path className="report-chart-line" d={linePath} />}
          {points.map((point) => <circle key={point.date} className={`report-chart-point${activePoint?.date === point.date ? ' active' : ''}`} cx={point.x} cy={point.y} r={activePoint?.date === point.date ? 6 : 4.5} tabIndex={0} role="img" aria-label={`${formatReportDate(point.date)}: ${formatReportCurrency(point.value, currency)}`} onMouseEnter={() => setActivePoint(point)} onFocus={() => setActivePoint(point)} onBlur={() => setActivePoint(null)} onClick={() => setActivePoint(point)}><title>{formatReportDate(point.date)} · {formatReportCurrency(point.value, currency)}</title></circle>)}
          {xLabels.map((point) => <text key={point.date} className="report-chart-axis-label report-chart-date-label" x={point.x} y={chartHeight - 19} textAnchor="middle">{point.date.slice(8, 10)}/{point.date.slice(5, 7)}</text>)}
        </svg>
        {activePoint && <div className="report-chart-tooltip" role="tooltip" style={{ '--tooltip-x': `${activePoint.x / chartWidth * 100}%`, '--tooltip-y': `${activePoint.y / chartHeight * 100}%` } as CSSProperties}><strong>{formatReportDate(activePoint.date)}</strong><span>{formatReportCurrency(activePoint.value, currency)}</span></div>}
      </div>
      <div className="report-chart-legend"><span><i aria-hidden="true" />Doanh thu ròng</span><span className="muted">Giá trị theo ngày của cửa hàng</span></div>
    </>}
  </section>;
}

function makePoints(rows: RevenueReport['daily']): ChartPoint[] {
  const values = rows.map((row) => Number(row.netRevenue)).filter(Number.isFinite);
  if (rows.length === 0 || values.length !== rows.length) return [];
  const left = plot.left;
  const width = chartWidth - plot.left - plot.right;
  const firstDay = Date.parse(`${rows[0].date}T00:00:00Z`);
  const lastDay = Date.parse(`${rows.at(-1)!.date}T00:00:00Z`);
  const daySpan = lastDay - firstDay;
  return rows.map((row) => {
    const amount = Number(row.netRevenue);
    const date = Date.parse(`${row.date}T00:00:00Z`);
    const x = rows.length === 1 || daySpan === 0 ? left + width / 2 : left + ((date - firstDay) / daySpan) * width;
    return { x, y: scaleY(amount, values), amount, date: row.date, value: row.netRevenue };
  });
}

function scaleY(value: number, values: number[]) {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = maximum - minimum;
  const padding = range === 0 ? 1 : range * 0.12;
  const low = minimum < 0 ? minimum - padding : 0;
  const high = maximum > 0 ? maximum + padding : 1;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  return plot.top + ((high - value) / (high - low)) * plotHeight;
}

function getTickValues(values: number[]) {
  if (values.length === 0) return [];
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = maximum - minimum;
  const padding = range === 0 ? 1 : range * 0.12;
  const low = minimum < 0 ? minimum - padding : 0;
  const high = maximum > 0 ? maximum + padding : 1;
  return Array.from({ length: 5 }, (_, index) => high - index * ((high - low) / 4));
}

function makeLinePath(points: ChartPoint[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = previous.x + (point.x - previous.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function getLabelPoints(points: ChartPoint[]) {
  if (points.length <= 6) return points;
  const indexes = new Set(Array.from({ length: 6 }, (_, index) => Math.round(index * (points.length - 1) / 5)));
  return points.filter((_, index) => indexes.has(index));
}
