'use client';

import { useMemo, useState } from 'react';
import {
  Building2, Cpu, Wifi, WifiOff, Radio, ArrowRight,
  CheckCheck, Download, ShieldAlert, Bell, FileDown,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { hasPermission } from '@/lib/permissions';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusDot } from '@/components/shared/StatusBadge';
import { AlarmBadge } from '@/components/shared/AlarmBadge';
import { getSessionToken } from '@/lib/supabase';
import { cn, fmtTime, timeAgo } from '@/lib/utils';

export function AdminDashboard() {
  const { currentUser, organizations, devices, telemetry, alarms, setPanel, acknowledgeAlarm } = useApp();

  const [exportOrgId, setExportOrgId] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

  const canExport       = hasPermission(currentUser, 'reports:export');
  const canAckAlarms    = hasPermission(currentUser, 'alarms:acknowledge');
  const canCfgAlarms    = hasPermission(currentUser, 'alarms:configure');
  const canManageRoles  = hasPermission(currentUser, 'members:manage');

  const online     = devices.filter((d) => d.status === 'online').length;
  const offline    = devices.length - online;
  const ledger     = telemetry.slice(0, 14);
  const openAlarms = alarms.filter((a) => !a.acknowledged);

  // filter alarms by selected org
  const filteredAlarms = useMemo(() => {
    if (exportOrgId === 'all') return openAlarms;
    const orgDevIds = new Set(devices.filter((d) => d.organization_id === exportOrgId).map((d) => d.id));
    return openAlarms.filter((a) => orgDevIds.has(a.device_id));
  }, [openAlarms, exportOrgId, devices]);

  const perOrg = useMemo(() =>
    organizations.map((o) => {
      const list = devices.filter((d) => d.organization_id === o.id);
      return { org: o, total: list.length, online: list.filter((d) => d.status === 'online').length };
    }), [organizations, devices]);

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  async function exportCsv() {
    setExporting(true);
    try {
      const token = await getSessionToken();
      const orgParam = exportOrgId === 'all' ? organizations[0]?.id ?? '' : exportOrgId;
      // Admin exports one org at a time; loop all orgs if 'all' selected in demo mode (no JWT)
      if (exportOrgId === 'all') {
        // In demo/no-auth mode: just export the first org or show toast
        // In live mode: this triggers one download per org — UX decision: export first org
      }
      const url = `/api/export?org_id=${orgParam}&devices=all`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        alert(`Export failed: ${err.error ?? res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      const orgName = organizations.find((o) => o.id === orgParam)?.name ?? 'export';
      a.download = `everspark-${orgName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-ink">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">{organizations.length} organizations · {devices.length} devices</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageRoles && (
            <button
              onClick={() => setPanel({ view: 'roles' })}
              className="btn-ghost text-sm flex items-center gap-2"
            >
              <ShieldAlert size={15} />
              Roles &amp; Permissions
            </button>
          )}
          {canCfgAlarms && (
            <button
              onClick={() => setPanel({ view: 'alarm-rules' })}
              className="btn-ghost text-sm flex items-center gap-2"
            >
              <Bell size={15} />
              Alarm Rules
            </button>
          )}
        </div>
      </div>

      {/* ── Metric row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Active Organizations" value={organizations.length} icon={Building2} accent="accent" hint="client enterprises" />
        <MetricCard label="Hardware Nodes"       value={devices.length}       icon={Cpu}       accent="brand"   hint={`${perOrg.length} sites`} />
        <MetricCard label="Online Now"           value={online}               icon={Wifi}      accent="emerald" delta={{ value: `${Math.round((online / Math.max(devices.length, 1)) * 100)}%`, positive: true }} hint="reporting" />
        <MetricCard label="Offline"              value={offline}              icon={WifiOff}   accent="rose"    hint="no recent data" />
      </div>

      {/* ── Active Alarms — full width ────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className={cn('grid place-items-center h-8 w-8 rounded-lg', openAlarms.length ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400')}>
              <Bell size={16} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink">Active Alarms</h3>
              <p className="text-xs text-slate-400">Unacknowledged alerts across all organizations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Org filter */}
            <select
              value={exportOrgId}
              onChange={(e) => setExportOrgId(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <span className={cn('chip', openAlarms.length ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
              {filteredAlarms.length} open
            </span>
            {canCfgAlarms && (
              <button onClick={() => setPanel({ view: 'alarm-rules' })} className="btn-ghost text-xs">
                Configure <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>

        {filteredAlarms.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">All systems nominal</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="text-left font-semibold px-5 py-2.5">Severity</th>
                  <th className="text-left font-semibold px-3 py-2.5">Type</th>
                  <th className="text-left font-semibold px-3 py-2.5">Device</th>
                  <th className="text-left font-semibold px-3 py-2.5">Detail</th>
                  <th className="text-left font-semibold px-3 py-2.5">Time</th>
                  {canAckAlarms && <th className="text-right font-semibold px-5 py-2.5">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredAlarms.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <AlarmBadge severity={a.severity ?? 'warning'} />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700 capitalize whitespace-nowrap">
                      {a.alarm_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate" title={deviceName(a.device_id)}>
                      {deviceName(a.device_id)}
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs max-w-[260px] truncate" title={a.message}>
                      {a.parameter && a.value !== undefined
                        ? `${a.parameter}: ${a.value}`
                        : a.message}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {timeAgo(a.timestamp)}
                    </td>
                    {canAckAlarms && (
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => acknowledgeAlarm(a.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors border border-slate-200"
                        >
                          <CheckCheck size={13} /> Acknowledge
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Export CSV ────────────────────────────────────────────────── */}
      {canExport && (
        <div className="card px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-9 w-9 rounded-lg bg-brand-50 text-brand-600">
              <FileDown size={18} />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">Export Telemetry Data</p>
              <p className="text-xs text-slate-400">Download CSV for a selected organization</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={exportOrgId}
              onChange={(e) => setExportOrgId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={15} />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom grid: telemetry stream + org breakdown ─────────────── */}
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

        {/* Org breakdown */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Organizations</h3>
            <button onClick={() => setPanel({ view: 'organizations' })} className="btn-ghost text-xs">
              Manage <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {perOrg.map(({ org, total, online: orgOnline }) => (
              <button
                key={org.id}
                onClick={() => setPanel({ view: 'organizations' })}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{org.name}</p>
                  <p className="text-xs text-slate-400">{total} device{total !== 1 ? 's' : ''}</p>
                </div>
                <span className={cn('chip', orgOnline > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  <StatusDot online={orgOnline > 0} /> {orgOnline}/{total}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
