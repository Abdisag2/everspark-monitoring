'use client';

import { useMemo } from 'react';
import { Cpu, Wifi, WifiOff, Users, Radio, ArrowRight, Download } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MetricCard } from '@/components/shared/MetricCard';
import { DeviceList } from '@/components/viewer/DeviceList';
import { getSessionToken } from '@/lib/supabase';
import { fmtTime } from '@/lib/utils';

export function ManagerDashboard() {
  const { currentUser, getVisibleDevices, getVisibleProfiles, telemetry, setPanel } = useApp();
  const devices = getVisibleDevices();
  const members = getVisibleProfiles();

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

  const online = devices.filter((d) => d.status === 'online').length;
  const deviceIds = useMemo(() => new Set(devices.map((d) => d.id)), [devices]);
  const ledger = telemetry.filter((t) => deviceIds.has(t.device_id)).slice(0, 8);
  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Org Devices" value={devices.length} icon={Cpu} accent="brand" hint="in your organization" />
        <MetricCard label="Online" value={online} icon={Wifi} accent="emerald" hint="reporting now" />
        <MetricCard label="Offline" value={devices.length - online} icon={WifiOff} accent="rose" hint="no recent data" />
        <MetricCard label="Team Members" value={members.length} icon={Users} accent="violet" hint="with access" />
      </div>

      {/* Scoped telemetry stream */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-600"><Radio size={16} /></span>
            <div>
              <h3 className="text-sm font-bold text-ink">Organization Telemetry Stream</h3>
              <p className="text-xs text-slate-400">Live packets from your devices only</p>
            </div>
          </div>
          <button onClick={() => setPanel({ view: 'devices' })} className="btn-ghost text-xs">Manage devices <ArrowRight size={13} /></button>
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
              {ledger.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">No telemetry yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operational device grid (reuses the read-only monitoring cards, scoped) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-ink">Operational Grid</h3>
          <button onClick={exportAll} className="btn-ghost text-xs flex items-center gap-1.5">
            <Download size={13} /> Export All
          </button>
        </div>
        <DeviceList backView="manager-dashboard" compact />
      </div>
    </div>
  );
}
