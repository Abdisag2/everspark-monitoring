'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, Check, Search, ChevronDown } from 'lucide-react';
import { TIME_RANGES, rangeShort } from '@/lib/timeRanges';
import { cn } from '@/lib/utils';

/** Grafana-style searchable quick-range selector. */
export function TimeRangePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const q = query.toLowerCase();
  const matches = TIME_RANGES.filter((r) => r.label.toLowerCase().includes(q));
  const relative = matches.filter((r) => r.group === 'relative');
  const calendar = matches.filter((r) => r.group === 'calendar');

  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(''); };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-outline py-2 gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Clock size={15} className="text-slate-400" />
        <span className="tabular-nums">{rangeShort(value)}</span>
        <ChevronDown size={14} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 card shadow-card-hover z-40 animate-scale-in overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search quick ranges"
                className="input pl-8 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <Section title="Relative ranges" items={relative} value={value} onPick={pick} />
            {calendar.length > 0 && <Section title="Calendar ranges" items={calendar} value={value} onPick={pick} />}
            {matches.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">No ranges match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items, value, onPick }: {
  title: string; items: { id: string; label: string }[]; value: string; onPick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      {items.map((r) => {
        const active = r.id === value;
        return (
          <button
            key={r.id}
            onClick={() => onPick(r.id)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors cursor-pointer',
              active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {r.label}
            {active && <Check size={14} className="text-brand-600" />}
          </button>
        );
      })}
    </div>
  );
}
