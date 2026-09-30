import { BadRequestException } from '@nestjs/common';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function validateDay(day: string | undefined) {
  if (!day) return;
  if (!dayPattern.test(day)) throw new BadRequestException('Dates must use YYYY-MM-DD');
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new BadRequestException('Date is invalid');
  }
}

function partsAt(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

export function addCalendarDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function storeMidnightUtc(day: string, timezone: string): Date {
  if (!dayPattern.test(day)) throw new BadRequestException('Dates must use YYYY-MM-DD');
  const [year, month, date] = day.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, date));
  if (check.toISOString().slice(0, 10) !== day) throw new BadRequestException('Date is invalid');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new BadRequestException('Store timezone is invalid'); }
  const target = Date.UTC(year, month - 1, date);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partsAt(new Date(candidate), timezone);
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const diff = target - represented;
    candidate += diff;
    if (diff === 0) break;
  }
  return new Date(candidate);
}

export function storeDateRange(from: string | undefined, to: string | undefined, timezone: string) {
  validateDay(from);
  validateDay(to);
  const endDay = to ? addCalendarDays(to, 1) : undefined;
  if (from && to && from > to) throw new BadRequestException('dateFrom must be on or before dateTo');
  if (from && to && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
    throw new BadRequestException('Date range cannot exceed 366 days');
  }
  if (!from && !endDay) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = storeMidnightUtc(from, timezone);
  if (endDay) range.lt = storeMidnightUtc(endDay, timezone);
  return range;
}
