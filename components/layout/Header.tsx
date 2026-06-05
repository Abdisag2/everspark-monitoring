'use client';

import { useEffect, useState } from 'react';
import { Bell, Search, Building2, ChevronRight, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NAV_BY_ROLE } from '@/lib/nav';
import { cn, fmtTime, timeAgo } from '@/lib/utils';

const EXTRA_TITLES: Record<string, { label: string; desc: string }> = {
  'device-monitoring': { label: 'Device Monitoring', desc: 'Live telemetry & history' },
};

export function Header() {
  const { currentUser, panelState, organizations, devices, getUnackedAlarms, acknowledgeAlarm } = useApp();
  const canAck = currentUser.role !== 'viewer';
  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;
  const [time, setTime] = useState<string>('');
  const [bellOpen, setBellOpen] = useState(false);
  const unacked = getUnackedAlarms();

  useEffect(() => {
    const tick = () => setTime(fmtTime(new Date().toISOString()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const allItems = NAV_BY_ROLE[currentUser.role].flatMap((s) => s.items);
  const current = allItems.find((i) => i.view === panelState.view);
  const meta = current ?? EXTRA_TITLES[panelState.view] ?? { label: 'Dashboard', desc: '' };

  const orgName = currentUser.role === 'admin'
    ? 'All Organizations'
    : organizations.find((o) => o.id === currentUser.organization_id)?.name ?? '—';

  return (
    <header className="flex items-center justify-between gap-4 h-14 px-5 bg-white/80 backdrop-blur border-b border-slate-200/80 shrink-0 z-30">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Building2 size={12} />
          <span className="truncate">{orgName}</span>
          <ChevronRight size={11} />
          <span className="text-slate-500 font-medium">{meta.label}</span>
        </div>
        <h1 className="text-base font-bold text-ink leading-tight truncate">{meta.label}</h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative hidden lg:block">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search…"
            className="input pl-9 py-2 w-52 text-sm"
            aria-label="Search"
          />
        </div>

        <span className="hidden md:inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-50 text-xs font-mono font-medium text-slate-500 tabular-nums">
          {time}
        </span>

        <div className="relative">
          <button
            onClick={() => setBellOpen((o) => !o)}
            className="relative btn-ghost p-2 rounded-xl"
            aria-label={`Notifications, ${unacked.length} unread`}
          >
            <Bell size={18} />
            {unacked.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid place-items-center h-4 min-w-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {unacked.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 card shadow-card-hover z-40 animate-scale-in overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">Active Alarms</span>
                  <span className="chip bg-rose-50 text-rose-600">{unacked.length}</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {unacked.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">No active alarms 🎉</p>
                  )}
                  {unacked.map((a) => (
                    <div key={a.id} className="px-4 py-3 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                          <span className="text-xs font-semibold text-rose-600 capitalize">{a.alarm_type.replace(/_/g, ' ')}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">· {timeAgo(a.timestamp)}</span>
                        </div>
                        {canAck && (
                          <button
                            onClick={() => acknowledgeAlarm(a.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors cursor-pointer shrink-0"
                            title="Acknowledge"
                          >
                            <Check size={13} /> Ack
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400 truncate">{deviceName(a.device_id)}</p>
                      <p className="mt-1 text-xs text-slate-600 leading-snug">{a.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
