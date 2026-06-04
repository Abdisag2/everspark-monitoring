'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft, Clock, Droplets, FlaskConical, Gauge, Activity, Download, ChevronDown,
  MapPin, Cpu, CircleSlash, CheckCircle2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MetricCard } from '@/components/shared/MetricCard';
import {
  ChartCard, FlowRateChart, ProductionStateChart, VoltageChart, ChlorinePhChart,
} from '@/components/charts/TelemetryCharts';
import { rangeStart, timeAgo, fmtDateTime, cn } from '@/lib/utils';
import type { PanelView, TimeRange } from '@/lib/types';

const RANGES: { id: TimeRange; label: string }[] = [
  { id: '6h', label: '6h' }, { id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' },
];

export function DeviceDetail({ deviceId, backView }: { deviceId: string; backView?: PanelView }) {
  const { devices, getDeviceTelemetry, getLatestTelemetry, organizations, setPanel } = useApp();
  const [range, setRange] = useState<TimeRange>('24h');
  const [showRaw, setShowRaw] = useState(false);

  const device = devices.find((d) => d.id === deviceId);
  const all = getDeviceTelemetry(deviceId, 1000);
  const latest = getLatestTelemetry(deviceId);

  const inRange = useMemo(() => {
    const start = rangeStart(range);
    return all.filter((t) => new Date(t.timestamp).getTime() >= start);
  }, [all, range]);

  const stats = useMemo(() => {
    const flowTotalL = inRange.reduce((s, t) => s + t.flow_rate * 15, 0); // L/min over 15-min frames
    const nacloL = inRange.reduce((s, t) => s + t.naclo_pumped, 0);
    return {
      flowTotalM3: flowTotalL / 1000,
      nacloL,
      naClOAvailable: latest ? latest.level_sensor_3 !== 1 : true,
      targetFrc: latest?.target_frc ?? 0,
      activeCl: latest?.active_chlorine ?? 0,
      ph: latest?.ph_value ?? 0,
    };
  }, [inRange, latest]);

  if (!device) {
    return <div className="card p-12 text-center text-slate-400">Device not found.</div>;
  }
  const orgName = organizations.find((o) => o.id === device.organization_id)?.name ?? '—';

  const exportCsv = () => {
    const header = ['timestamp', 'flow_rate', 'voltage', 'level_1', 'level_2', 'level_3', 'naclo_pumped', 'target_frc', 'active_chlorine', 'ph'];
    const lines = inRange.map((t) => [t.timestamp, t.flow_rate, t.voltage, t.level_sensor_1, t.level_sensor_2, t.level_sensor_3, t.naclo_pumped, t.target_frc, t.active_chlorine, t.ph_value].join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${device.system_id ?? device.id}_${range}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {backView && (
            <button onClick={() => setPanel({ view: backView } as any)} className="btn-ghost p-2 rounded-xl mt-0.5 shrink-0" title="Back">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-ink truncate">{device.name}</h2>
              <StatusBadge online={device.status === 'online'} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1"><Cpu size={12} />{orgName}</span>
              {device.location && <span className="inline-flex items-center gap-1"><MapPin size={12} />{device.location}</span>}
              {device.system_id && <span className="font-mono">{device.system_id}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer', range === r.id ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink')}>{r.label}</button>
            ))}
          </div>
          <button onClick={exportCsv} className="btn-outline py-2"><Download size={15} /> Export</button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <MetricCard label="Last Connection" value={timeAgo(device.last_seen)} icon={Clock} accent="accent" hint={`${inRange.length} frames`} />
        <MetricCard label="Water Flow Total" value={stats.flowTotalM3.toFixed(2)} unit="m³" icon={Droplets} accent="brand" hint={`in ${range}`} />
        <MetricCard label="NaClO Consumed" value={stats.nacloL.toFixed(1)} unit="L" icon={FlaskConical} accent="violet" hint={`in ${range}`} />
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <span className="text-[13px] font-medium text-slate-500">NaClO Available</span>
            <span className={cn('grid place-items-center h-9 w-9 rounded-xl ring-4', stats.naClOAvailable ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-amber-50 text-amber-600 ring-amber-100')}>
              {stats.naClOAvailable ? <CheckCircle2 size={18} /> : <CircleSlash size={18} />}
            </span>
          </div>
          <p className={cn('mt-3 text-3xl font-bold tracking-tight', stats.naClOAvailable ? 'text-emerald-600' : 'text-amber-500')}>{stats.naClOAvailable ? 'Yes' : 'No'}</p>
          <p className="mt-1.5 text-xs text-slate-400">storage tank</p>
        </div>
        <MetricCard label="Target FRC" value={stats.targetFrc.toFixed(2)} unit="mg/L" icon={Gauge} accent="emerald" hint={`Cl₂ ${stats.activeCl.toFixed(1)} · pH ${stats.ph.toFixed(1)}`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Flow Rate" subtitle="Parameter 1 · L/min" badge={<span className="chip bg-brand-50 text-brand-600">Scatter</span>}>
          <FlowRateChart data={inRange} />
        </ChartCard>
        <ChartCard title="NaClO Production State" subtitle="Parameter 3 · in-production vs stand-by" badge={<span className="chip bg-brand-50 text-brand-600">State</span>}>
          <ProductionStateChart data={inRange} />
        </ChartCard>
        <ChartCard title="System Voltage" subtitle="Parameter 2 · V" badge={<span className="chip bg-accent-50 text-accent-600">Scatter</span>}>
          <VoltageChart data={inRange} />
        </ChartCard>
        <ChartCard title="Active Chlorine & pH" subtitle="Parameters 8 & 9" badge={<span className="chip bg-rose-50 text-rose-600">Dual axis</span>}>
          <ChlorinePhChart data={inRange} />
        </ChartCard>
      </div>

      {/* Raw data */}
      <div className="card overflow-hidden">
        <button onClick={() => setShowRaw((s) => !s)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-slate-100 text-slate-500"><Activity size={16} /></span>
            <div className="text-left">
              <h3 className="text-sm font-bold text-ink">Raw Telemetry</h3>
              <p className="text-xs text-slate-400">{inRange.length} frames in {range} · verify exact values & parameters</p>
            </div>
          </div>
          <ChevronDown size={18} className={cn('text-slate-400 transition-transform', showRaw && 'rotate-180')} />
        </button>
        {showRaw && (
          <div className="border-t border-slate-100 overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  {['Time', 'Flow', 'Volt', 'L1', 'L2', 'L3', 'NaClO', 'FRC', 'Cl₂', 'pH'].map((h) => (
                    <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-mono tabular-nums">
                {inRange.slice(0, 200).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{fmtDateTime(t.timestamp)}</td>
                    <td className="px-3 py-1.5">{t.flow_rate.toFixed(1)}</td>
                    <td className="px-3 py-1.5">{t.voltage.toFixed(1)}</td>
                    <td className="px-3 py-1.5">{t.level_sensor_1}</td>
                    <td className="px-3 py-1.5">{t.level_sensor_2}</td>
                    <td className="px-3 py-1.5">{t.level_sensor_3}</td>
                    <td className="px-3 py-1.5">{t.naclo_pumped.toFixed(1)}</td>
                    <td className="px-3 py-1.5">{t.target_frc.toFixed(1)}</td>
                    <td className="px-3 py-1.5">{t.active_chlorine.toFixed(1)}</td>
                    <td className="px-3 py-1.5">{t.ph_value.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
