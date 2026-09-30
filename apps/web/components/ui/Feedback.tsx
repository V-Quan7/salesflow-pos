import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="box" size={22} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function LoadingRows({ count = 5 }: { count?: number }) {
  return <div className="loading-rows" aria-label="Đang tải" role="status">{Array.from({ length: count }, (_, index) => <span className="skeleton-row" key={index} />)}</div>;
}
