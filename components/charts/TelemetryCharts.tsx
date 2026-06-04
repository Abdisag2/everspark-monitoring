'use client';

import {
  ResponsiveContainer, ScatterChart, Scatter, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ZAxis,
} from 'recharts';
import type { TelemetryRecord } from '@/lib/types';

const AXIS = { stroke: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' };
const GRID = '#eef2f5';

/** Telemetry comes newest-first; charts want oldest→newest with a short time label. */
function toSeries(data: TelemetryRecord[]) {
  return [...data]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((t) => ({
      ...t,
      t: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
}

export function ChartCard({
  title, subtitle, badge, children, height = 240,
}: {
  title: string; subtitle?: string; badge?: React.ReactNode; children: React.ReactNode; height?: number;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-card-hover text-xs">
      <p className="font-mono text-slate-400 mb-1">{payload[0]?.payload?.t}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-semibold tabular-nums" style={{ color: p.color ?? p.stroke }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{unit ?? ''}
        </p>
      ))}
    </div>
  );
}

export function FlowRateChart({ data }: { data: TelemetryRecord[] }) {
  const series = toSeries(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} unit=" L/m" width={56} />
        <ZAxis range={[26, 26]} />
        <Tooltip content={<CustomTooltip unit=" L/min" />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
        <Scatter name="Flow Rate" data={series} dataKey="flow_rate" fill="#0d8e87" fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function ProductionStateChart({ data }: { data: TelemetryRecord[] }) {
  const series = toSeries(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15b1a6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#15b1a6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
        <YAxis tick={false} axisLine={false} width={56} domain={[0, 1]} ticks={[0, 1]}
          tickFormatter={(v) => (v === 1 ? 'In production' : 'Stand by')} />
        <Tooltip content={({ active, payload }: any) =>
          active && payload?.length ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-card-hover text-xs">
              <p className="font-mono text-slate-400 mb-1">{payload[0]?.payload?.t}</p>
              <p className="font-semibold text-brand-600">{payload[0].value === 1 ? 'In production' : 'Stand by'}</p>
            </div>
          ) : null} />
        <Area type="stepAfter" dataKey="level_sensor_1" name="Production" stroke="#0d8e87" strokeWidth={2} fill="url(#prodFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VoltageChart({ data }: { data: TelemetryRecord[] }) {
  const series = toSeries(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="V" width={56} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
        <ZAxis range={[26, 26]} />
        <Tooltip content={<CustomTooltip unit="V" />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
        <Scatter name="Voltage" data={series} dataKey="voltage" fill="#0284c7" fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function ChlorinePhChart({ data }: { data: TelemetryRecord[] }) {
  const series = toSeries(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
        <YAxis yAxisId="cl" tick={AXIS} tickLine={false} axisLine={false} width={42} unit="" />
        <YAxis yAxisId="ph" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={32} domain={[6, 8]} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        <Line yAxisId="cl" type="monotone" dataKey="active_chlorine" name="Active Chlorine (mg/L)" stroke="#0d8e87" strokeWidth={2} dot={false} />
        <Line yAxisId="ph" type="monotone" dataKey="ph_value" name="pH" stroke="#db2777" strokeWidth={2} dot={false} strokeDasharray="5 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}
