import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: LucideIcon;
  accent?: 'brand' | 'accent' | 'emerald' | 'amber' | 'violet' | 'rose';
  delta?: { value: string; positive?: boolean };
  hint?: string;
  className?: string;
}

const ACCENTS: Record<NonNullable<MetricCardProps['accent']>, { bg: string; fg: string; ring: string }> = {
  brand:   { bg: 'bg-brand-50',   fg: 'text-brand-600',   ring: 'ring-brand-100' },
  accent:  { bg: 'bg-accent-50',  fg: 'text-accent-600',  ring: 'ring-accent-100' },
  emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600', ring: 'ring-emerald-100' },
  amber:   { bg: 'bg-amber-50',   fg: 'text-amber-600',   ring: 'ring-amber-100' },
  violet:  { bg: 'bg-violet-50',  fg: 'text-violet-600',  ring: 'ring-violet-100' },
  rose:    { bg: 'bg-rose-50',    fg: 'text-rose-600',    ring: 'ring-rose-100' },
};

export function MetricCard({ label, value, unit, icon: Icon, accent = 'brand', delta, hint, className }: MetricCardProps) {
  const a = ACCENTS[accent];
  return (
    <div className={cn('card p-5 group transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5', className)}>
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        {Icon && (
          <span className={cn('grid place-items-center h-9 w-9 rounded-xl ring-4', a.bg, a.fg, a.ring)}>
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', delta.positive ? 'text-emerald-600' : 'text-rose-500')}>
            {delta.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {delta.value}
          </span>
        )}
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
    </div>
  );
}
