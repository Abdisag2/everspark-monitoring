'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Search, Cpu, Wifi, FlaskConical, Bell, ArrowRight, Droplets, Gauge } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LiveHardwareFeed } from '@/components/shared/LiveHardwareFeed';
import { timeAgo, cn } from '@/lib/utils';
import type { PanelView } from '@/lib/types';

function Sparkline({ data }: { data: number[] }) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15b1a6" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#15b1a6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="#0d8e87" strokeWidth={1.5} fill="url(#spark)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DeviceList({ backView = 'viewer-devices', compact = false }: { backView?: PanelView; compact?: boolean }) {
  const { getVisibleDevices, getLatestTelemetry, getDeviceTelemetry, getUnackedAlarms, setPanel } = useApp();
  const [query, setQuery] = useState('');

  const devices = getVisibleDevices();
  const alarms = getUnackedAlarms();

  const summary = useMemo(() => {
    const online = devices.filter((d) => d.status === 'online');
    const cls = online.map((d) => getLatestTelemetry(d.id)?.active_chlorine ?? 0).filter((v) => v > 0);
    const avgCl = cls.length ? cls.reduce((a, b) => a + b, 0) / cls.length : 0;
    return { total: devices.length, online: online.length, avgCl };
  }, [devices, getLatestTelemetry]);

  const rows = devices.filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase()) || (d.location ?? '').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {!compact && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Assigned Devices" value={summary.total} icon={Cpu} accent="brand" hint="in your organization" />
            <MetricCard label="Online" value={summary.online} icon={Wifi} accent="emerald" hint="reporting now" />
            <MetricCard label="Avg Active Chlorine" value={summary.avgCl.toFixed(2)} unit="mg/L" icon={FlaskConical} accent="violet" hint="across online nodes" />
            <MetricCard label="Active Alarms" value={alarms.length} icon={Bell} accent={alarms.length ? 'rose' : 'emerald'} hint={alarms.length ? 'need attention' : 'all clear'} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">Live Monitoring</h2>
              <p className="text-sm text-slate-500">Read-only telemetry for your assigned hardware</p>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search devices…" className="input pl-9 py-2 w-full sm:w-60" />
            </div>
          </div>
        </>
      )}

      {/* Device cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((d) => {
          const latest = getLatestTelemetry(d.id);
          const recent = getDeviceTelemetry(d.id, 24).map((t) => t.flow_rate).reverse();
          return (
            <button
              key={d.id}
              onClick={() => setPanel({ view: 'device-monitoring', deviceId: d.id, backView })}
              className={cn(
                'card p-5 text-left group hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
                d.status === 'offline' && 'ring-2 ring-rose-400 ring-offset-2 animate-pulse',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate group-hover:text-brand-600 transition-colors" title={d.name}>{d.name}</p>
                  <p className="text-xs text-slate-400 truncate">{d.location ?? d.system_id ?? '—'}</p>
                </div>
                <StatusBadge online={d.status === 'online'} />
              </div>

              <div className="mt-3 h-9">
                {recent.length > 1 ? <Sparkline data={recent} /> : <div className="h-full grid place-items-center text-[11px] text-slate-300">no recent data</div>}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-center gap-1"><Droplets size={10} />Flow</p>
                  <p className="text-sm font-bold text-ink tabular-nums">{latest?.flow_rate.toFixed(1) ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-center gap-1"><FlaskConical size={10} />Cl₂</p>
                  <p className="text-sm font-bold text-ink tabular-nums">{latest?.active_chlorine.toFixed(1) ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-center gap-1"><Gauge size={10} />pH</p>
                  <p className="text-sm font-bold text-ink tabular-nums">{latest?.ph_value.toFixed(1) ?? '—'}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">{timeAgo(d.last_seen)}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">View details <ArrowRight size={13} /></span>
              </div>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="col-span-full card p-12 grid place-items-center text-center">
            <Cpu size={28} className="text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No devices assigned to your organization yet.</p>
          </div>
        )}
      </div>

      {!compact && <LiveHardwareFeed />}
    </div>
  );
}
