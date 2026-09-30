export function formatReportCurrency(value: string | number, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);

  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount);
  } catch {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(amount);
  }
}

export function formatCompactReportCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
}

export function formatReportDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

