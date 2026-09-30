import { Icon, type IconName } from '../ui/Icon';

type ReportStatCardProps = {
  title: string;
  value: string;
  description: string;
  icon: IconName;
  tone: 'revenue' | 'sales' | 'refund';
};

export function ReportStatCard({ title, value, description, icon, tone }: ReportStatCardProps) {
  return <article className={`report-stat-card report-stat-${tone}`}>
    <div className="report-stat-heading"><span className="report-stat-icon"><Icon name={icon} size={20} /></span><span>{title}</span></div>
    <strong className="report-stat-value">{value}</strong>
    <span className="report-stat-description">{description}</span>
  </article>;
}

