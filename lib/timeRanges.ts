export interface TimeRangeOption { id: string; label: string; group: 'relative' | 'calendar'; }

export const TIME_RANGES: TimeRangeOption[] = [
  { id: '5m',  label: 'Last 5 minutes',  group: 'relative' },
  { id: '15m', label: 'Last 15 minutes', group: 'relative' },
  { id: '30m', label: 'Last 30 minutes', group: 'relative' },
  { id: '1h',  label: 'Last 1 hour',     group: 'relative' },
  { id: '3h',  label: 'Last 3 hours',    group: 'relative' },
  { id: '6h',  label: 'Last 6 hours',    group: 'relative' },
  { id: '12h', label: 'Last 12 hours',   group: 'relative' },
  { id: '24h', label: 'Last 24 hours',   group: 'relative' },
  { id: '2d',  label: 'Last 2 days',     group: 'relative' },
  { id: '7d',  label: 'Last 7 days',     group: 'relative' },
  { id: '30d', label: 'Last 30 days',    group: 'relative' },
  { id: '90d', label: 'Last 90 days',    group: 'relative' },
  { id: '6mo', label: 'Last 6 months',   group: 'relative' },
  { id: '1y',  label: 'Last 1 year',     group: 'relative' },
  { id: '2y',  label: 'Last 2 years',    group: 'relative' },
  { id: '5y',  label: 'Last 5 years',    group: 'relative' },
  { id: 'week',    label: 'This week',    group: 'calendar' },
  { id: 'month',   label: 'This month',   group: 'calendar' },
  { id: 'quarter', label: 'This quarter', group: 'calendar' },
];

const MIN = 60e3, HR = 3600e3, DAY = 86400e3;

/** Start-of-window timestamp (ms) for a given range id. */
export function rangeStartMs(id: string): number {
  const now = new Date();
  switch (id) {
    case '5m':  return Date.now() - 5 * MIN;
    case '15m': return Date.now() - 15 * MIN;
    case '30m': return Date.now() - 30 * MIN;
    case '1h':  return Date.now() - HR;
    case '3h':  return Date.now() - 3 * HR;
    case '6h':  return Date.now() - 6 * HR;
    case '12h': return Date.now() - 12 * HR;
    case '24h': return Date.now() - 24 * HR;
    case '2d':  return Date.now() - 2 * DAY;
    case '7d':  return Date.now() - 7 * DAY;
    case '30d': return Date.now() - 30 * DAY;
    case '90d': return Date.now() - 90 * DAY;
    case '6mo': { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d.getTime(); }
    case '1y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.getTime(); }
    case '2y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 2); return d.getTime(); }
    case '5y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); return d.getTime(); }
    case 'week': {  // Monday as week start
      const d = new Date(now); const dow = (d.getDay() + 6) % 7;
      d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dow); return d.getTime();
    }
    case 'month':   return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'quarter': return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime();
    default: return Date.now() - 24 * HR;
  }
}

export function rangeLabel(id: string): string {
  return TIME_RANGES.find((r) => r.id === id)?.label ?? 'Last 24 hours';
}

/** Short label for compact UI ("6h", "30d", "This week"). */
export function rangeShort(id: string): string {
  const r = TIME_RANGES.find((x) => x.id === id);
  if (!r) return id;
  return r.group === 'calendar' ? r.label : r.label.replace('Last ', '');
}
