'use client';

import { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { buildDataString, fmtTime, timeAgo, cn } from '@/lib/utils';

/**
 * Live feed of real incoming hardware packets (from Supabase telemetry, polled).
 * Scoped to the devices the current user can see.
 */
export function LiveHardwareFeed({ limit = 12, className }: { limit?: number; className?: string }) {
  const { telemetry, getVisibleDevices } = useApp();

  const devices = getVisibleDevices();
  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    devices.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [devices]);

  const visibleIds = useMemo(() => new Set(devices.map((d) => d.id)), [devices]);
  const rows = telemetry.filter((t) => visibleIds.has(t.device_id)).slice(0, limit);
  const lastTs = rows[0]?.timestamp ?? null;

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600"><Radio size={16} /></span>
          <div>
            <h3 className="text-sm font-bold text-ink">Live Hardware Feed</h3>
            <p className="text-xs text-slate-400">Real packets from field nodes{lastTs ? ` · last ${timeAgo(lastTs)}` : ''}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 pulse-dot" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          live
        </span>
      </div>
      <div className="divide-y divide-slate-50 max-h-[360px] overflow-y-auto">
        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No hardware packets yet. They appear here within seconds of each transmission.</p>
        )}
        {rows.map((t) => (
          <div key={t.id} className="px-5 py-2.5 slide-in hover:bg-slate-50/70">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 truncate">{idToName.get(t.device_id) ?? t.device_id}</span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">{fmtTime(t.timestamp)}</span>
            </div>
            <code className="block mt-1 font-mono text-[11px] text-slate-500 break-all">{buildDataString(t)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
