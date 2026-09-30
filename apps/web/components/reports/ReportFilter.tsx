'use client';

import type { FormEvent } from 'react';
import { Icon } from '../ui/Icon';

export type ReportRangePreset = 'today' | '7-days' | '30-days' | 'custom';

type ReportFilterProps = {
  from: string;
  to: string;
  preset: ReportRangePreset;
  loading: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPresetChange: (preset: ReportRangePreset) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const presets: { value: ReportRangePreset; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7-days', label: '7 ngày' },
  { value: '30-days', label: '30 ngày' },
  { value: 'custom', label: 'Tùy chỉnh' },
];

export function ReportFilter({ from, to, preset, loading, onFromChange, onToChange, onPresetChange, onSubmit }: ReportFilterProps) {
  return <section className="report-filter admin-card" aria-label="Bộ lọc thời gian báo cáo">
    <div className="report-filter-heading">
      <div><span className="report-filter-icon"><Icon name="calendar" size={18} /></span><div><h2>Khoảng thời gian</h2><p className="muted">Chọn kỳ báo cáo cần xem</p></div></div>
      <div className="report-presets" role="group" aria-label="Khoảng thời gian nhanh">
        {presets.map(({ value, label }) => <button key={value} type="button" className={preset === value ? 'active' : ''} aria-pressed={preset === value} disabled={loading} onClick={() => onPresetChange(value)}>{label}</button>)}
      </div>
    </div>
    <form className="report-date-form" onSubmit={onSubmit}>
      <label className="report-date-field">Từ ngày<span className="report-date-input"><Icon name="calendar" size={17} /><input required type="date" value={from} disabled={loading || !from} onChange={(event) => onFromChange(event.target.value)} /></span></label>
      <span className="report-date-separator" aria-hidden="true">đến</span>
      <label className="report-date-field">Đến ngày<span className="report-date-input"><Icon name="calendar" size={17} /><input required type="date" value={to} disabled={loading || !to} onChange={(event) => onToChange(event.target.value)} /></span></label>
      <button type="submit" className="report-submit-button" disabled={loading || !from || !to}>
        {loading ? <span className="report-spinner" aria-hidden="true" /> : <Icon name="reports" size={17} />}
        {loading ? 'Đang tải…' : 'Xem báo cáo'}
      </button>
    </form>
  </section>;
}

