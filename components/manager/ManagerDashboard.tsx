'use client';

import { useMemo } from 'react';
import { Cpu, Wifi, WifiOff, Users, Radio, ArrowRight, Download, Bell, ShieldAlert, CheckCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MetricCard } from '@/components/shared/MetricCard';
import { AlarmBadge } from '@/components/shared/AlarmBadge';
import { DeviceList } from '@/components/viewer/DeviceList';
import { getSessionToken } from '@/lib/supabase';
import { fmtTime, timeAgo, cn } from '@/lib/utils';

export function ManagerDashboard() {
  const { currentUser, getVisibleDevices, getVisibleProfiles, getUnackedAlarms, telemetry, setPanel, acknowledgeAlarm } = useApp();
  const devices = getVisibleDevices();
  const members = getVisibleProfiles();
  const openAlarms = getUnackedAlarms();

  const online = devices.filter((d) => d.status === 'online').length;
  const deviceIds = useMemo(() => new Set(devices.map((d) => d.id)), [devices]);
  const ledger = telemetry.filter((t) => deviceIds.has(t.device_id)).slice(0, 8);
  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  async function exportAll() {
    const orgId = currentUser.organization_id;
    if (!orgId) return;
    const token = await getSessionToken();
    const url = `/api/export?org_id=${orgId}&devices=all`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `everspark-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Page header with quick-action buttons */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-ink">Dashboard</h1>
          <p className="text-sm text-slate-500">{currentUser.name} · {devices.length} device{devices.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanel({ view: 'alarm-rules' })}
            className="btn-ghost text-sm flex items-center gap-2"
          >
            <ShieldAlert size={15} />
            Alarm Rules
          </button>
          <button
            onClick={exportAll}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Org Devices"   value={devices.length}           icon={Cpu}   accent="brand"   hint="in your organization" />
        <MetricCard label="Online"        value={online}                   icon={Wifi}  accent="emerald" hint="reporting now" />
        <MetricCard label="Offline"       value={devices.length - online}  icon={WifiOff} accent="rose"  hint="no recent data" />
        <MetricCard label="Team Members"  value={members.length}           icon={Users} accent="violet"  hint="with access" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Telemetry stream */}
        <div className="xl:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-600"><Radio size={16} /></span>
              <div>
                <h3 className="text-sm font-bold text-ink">Organization Telemetry Stream</h3>
                <p className="text-xs text-slate-400">Live packets from your devices only</p>
              </div>
            </div>
            <button onClick={() => setPanel({ view: 'devices' })} className="btn-ghost text-xs">
              Manage devices <ArrowRight size={13} />
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
                    <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate" title={deviceName(t.device_id)}>{deviceName(t.device_id)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{t.flow_rate.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{t.voltage.toFixed(1)}V</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{t.active_chlorine.toFixed(1)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{t.ph_value.toFixed(1)}</td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">No telemetry yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active alarms panel */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={15} className={openAlarms.length ? 'text-rose-500' : 'text-slate-400'} />
              <h3 className="text-sm font-bold text-ink">Active Alarms</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('chip', openAlarms.length ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
                {openAlarms.length}
              </span>
              <button onClick={() => setPanel({ view: 'alarm-rules' })} className="btn-ghost text-xs">
                Configure <ArrowRight size={13} />
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
            {openAlarms.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-400">All systems nominal</p>
            )}
            {openAlarms.map((a) => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <AlarmBadge severity={a.severity ?? 'warning'} />
                      <span className="text-xs font-semibold text-slate-700 capitalize">
                        {a.alarm_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{deviceName(a.device_id)}</p>
                    {a.parameter && a.value !== undefined && (
                      <p className="text-xs text-slate-400">{a.parameter}: {a.value}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{timeAgo(a.timestamp)}</span>
                    <button
                      onClick={() => acknowledgeAlarm(a.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    >
                      <CheckCheck size={12} /> Ack
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Operational device grid */}
      <div>
        <h3 className="text-sm font-bold text-ink mb-3">Operational Grid</h3>
        <DeviceList backView="manager-dashboard" compact />
      </div>

    </div>
  );
}
