'use client';

import { cn } from '@/lib/utils';
import type { AlarmSeverity } from '@/lib/types';

interface AlarmBadgeProps {
  severity?: AlarmSeverity;
  label?: string;
  className?: string;
}

const STYLES: Record<AlarmSeverity, string> = {
  info:     'bg-blue-50 text-blue-700 border-blue-100',
  warning:  'bg-amber-50 text-amber-700 border-amber-100',
  critical: 'bg-rose-50 text-rose-700 border-rose-100',
};

const DOTS: Record<AlarmSeverity, string> = {
  info:     'bg-blue-400',
  warning:  'bg-amber-400',
  critical: 'bg-rose-500',
};

export function AlarmBadge({ severity = 'warning', label, className }: AlarmBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
      STYLES[severity],
      className,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[severity])} />
      {label ?? severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}
