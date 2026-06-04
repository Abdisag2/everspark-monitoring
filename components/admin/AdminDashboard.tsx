'use client';

import { useMemo } from 'react';
import { Building2, Cpu, Wifi, WifiOff, Radio, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusDot } from '@/components/shared/StatusBadge';
import { cn, fmtTime, timeAgo } from '@/lib/utils';

export function AdminDashboard() {
  const { organizations, devices, telemetry, alarms, setPanel } = useApp();

  const online = devices.filter((d) => d.status === 'online').length;
  const offline = devices.length - online;
  const ledger = telemetry.slice(0, 14);
  const openAlarms = alarms.filter((a) => !a.acknowledged);

  const perOrg = useMemo(() =>
    organizations.map((o) => {
      const list = devices.filter((d) => d.organization_id === o.id);
      return { org: o, total: list.length, online: list.filter((d) => d.status === 'online').length };
    }), [organizations, devices]);

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metric row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Active Organizations" value={organizations.length} icon={Building2} accent="accent" hint="client enterprises" />
        <MetricCard label="Hardware Nodes" value={devices.length} icon={Cpu} accent="brand" hint={`${perOrg.length} sites`} />
        <MetricCard label="Online Now" value={online} icon={Wifi} accent="emerald" delta={{ value: `${Math.round((online / Math.max(devices.length, 1)) * 100)}%`, positive: true }} hint="reporting" />
        <MetricCard label="Offline" value={offline} icon={WifiOff} accent="rose" hint="no recent data" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live global telemetry ledger */}
        <div className="xl:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-600">
                <Radio size={16} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">Global Telemetry Stream</h3>
                <p className="text-xs text-slate-400">Live packets across all organizations</p>
              </div>
            </div>
            <button onClick={() => setPanel({ view: 'simulation' })} className="btn-ghost text-xs">
              Open Simulator <ArrowRight size={13} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="text-left font-semibold px-5 py-2.5">Time</th>
                  <th className="text-left font-semibold px-3 py-2.5">Device</th>
                  <th className="text-right font-semibold px-3 py-2.5">Flow</th>
                  <th className="text-right font-semibold px-3 py-2.5">Voltage</th>
                  <th className="text-right font-semibold px-3 py-2.5">Cl₂</th>
                  <th className="text-right font-semibold px-5 py-2.5">pH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ledger.map((t) => (
                  <tr key={t.id} className="slide-in hover:bg-slate-50/70">
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">{fmtTime(t.timestamp)}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate" title={deviceName(t.device_id)}>{deviceName(t.device_id)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{t.flow_rate.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{t.voltage.toFixed(1)}V</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{t.active_chlorine.toFixed(1)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{t.ph_value.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Org breakdown */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-ink">Organizations</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {perOrg.map(({ org, total, online }) => (
                <button
                  key={org.id}
                  onClick={() => setPanel({ view: 'organizations' })}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{org.name}</p>
                    <p className="text-xs text-slate-400">{total} device{total !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={cn('chip', online > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    <StatusDot online={online > 0} /> {online}/{total}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Active alarms */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Active Alarms</h3>
              <span className={cn('chip', openAlarms.length ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>{openAlarms.length}</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
              {openAlarms.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">All systems nominal</p>}
              {openAlarms.map((a) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-600 capitalize">{a.alarm_type.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-slate-400">{timeAgo(a.timestamp)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 truncate" title={deviceName(a.device_id)}>{deviceName(a.device_id)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
