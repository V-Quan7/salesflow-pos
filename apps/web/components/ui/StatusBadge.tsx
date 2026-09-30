export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const normalized = value.toUpperCase().replaceAll(' ', '_');
  const tone = ['ACTIVE', 'COMPLETED', 'PAID', 'HEALTHY'].includes(normalized) ? 'success'
    : ['LOW_STOCK', 'PENDING'].includes(normalized) ? 'warning'
      : ['OUT_OF_STOCK', 'CANCELLED'].includes(normalized) ? 'danger'
        : ['REFUNDED', 'INACTIVE'].includes(normalized) ? 'neutral' : 'info';
  return <span className={`status-badge status-${tone}`}><span className="status-dot" />{label ?? value.replaceAll('_', ' ')}</span>;
}
