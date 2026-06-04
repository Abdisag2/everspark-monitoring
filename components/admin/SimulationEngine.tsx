'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Radio, Play, Pause, Send, Zap, AlertTriangle, FlaskConical, Trash2, Server, Cpu, Wifi,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { buildDataString, fmtTime, cn, type ParsedFrame } from '@/lib/utils';
import type { Device } from '@/lib/types';

type Mode = 'realistic' | 'manual';
const INTERVALS = [
  { ms: 1000, label: '1s' }, { ms: 2000, label: '2s' }, { ms: 5000, label: '5s' },
];

function realisticFrame(phase: number): ParsedFrame {
  const producing = Math.floor(phase / 6) % 2 === 0;
  return {
    flow_rate: producing ? +(34 + Math.sin(phase) * 10 + Math.random() * 5).toFixed(1) : +(Math.random() * 2).toFixed(1),
    voltage: +(12.2 + Math.sin(phase / 3) * 0.5 + Math.random() * 0.2).toFixed(1),
    level_sensor_1: producing ? 1 : 0,
    level_sensor_2: producing ? 0 : (Math.random() > 0.7 ? 1 : 0),
    level_sensor_3: 0,
    naclo_pumped: producing ? +(0.6 + Math.random() * 0.4).toFixed(1) : 0,
    target_frc: 1.0,
    active_chlorine: +(0.7 + Math.sin(phase / 2) * 0.2 + Math.random() * 0.1).toFixed(1),
    ph_value: +(7.0 + Math.sin(phase) * 0.3 + Math.random() * 0.1).toFixed(1),
  };
}

const MANUAL_FIELDS: { key: keyof ParsedFrame; label: string; min: number; max: number; step: number; binary?: boolean }[] = [
  { key: 'flow_rate', label: 'Flow Rate (L/min)', min: 0, max: 100, step: 0.1 },
  { key: 'voltage', label: 'Voltage (V)', min: 0, max: 15, step: 0.1 },
  { key: 'level_sensor_1', label: 'Level Sensor 1', min: 0, max: 1, step: 1, binary: true },
  { key: 'level_sensor_2', label: 'Level Sensor 2', min: 0, max: 1, step: 1, binary: true },
  { key: 'level_sensor_3', label: 'Level Sensor 3', min: 0, max: 1, step: 1, binary: true },
  { key: 'naclo_pumped', label: 'NaClO Pumped (L)', min: 0, max: 200, step: 0.1 },
  { key: 'target_frc', label: 'Target FRC (mg/L)', min: 0, max: 5, step: 0.1 },
  { key: 'active_chlorine', label: 'Active Chlorine (mg/L)', min: 0, max: 5, step: 0.1 },
  { key: 'ph_value', label: 'pH', min: 0, max: 14, step: 0.1 },
];

export function SimulationEngine() {
  const { devices, ingestTelemetry, addSimPacket, simPackets } = useApp();
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('realistic');
  const [interval, setIntervalMs] = useState(2000);
  const [streaming, setStreaming] = useState(false);
  const [hitEndpoint, setHitEndpoint] = useState(false);
  const [manual, setManual] = useState<ParsedFrame>(realisticFrame(0));
  const phaseRef = useRef(0);

  const device = devices.find((d) => d.id === deviceId);

  // Stable send function reading latest values via refs
  const cfg = useRef({ device, mode, manual, hitEndpoint });
  cfg.current = { device, mode, manual, hitEndpoint };

  const sendOne = useCallback(async () => {
    const { device: dev, mode: m, manual: man, hitEndpoint: hit } = cfg.current;
    if (!dev) return;
    const frame = m === 'realistic' ? realisticFrame((phaseRef.current += 1)) : man;
    const dataStr = buildDataString(frame);
    const raw = `token=${dev.secret_token}&data=${dataStr}`;
    const res = ingestTelemetry(dev.secret_token, dataStr);
    addSimPacket({
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      token: dev.secret_token,
      device_name: dev.name,
      raw_payload: raw,
      data_string: dataStr,
      timestamp: new Date().toISOString(),
      status: res.ok ? 'ok' : 'error',
      error: res.error,
    });
    if (hit) {
      fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'field-node', 'ngrok-skip-browser-warning': '69420' },
        body: raw,
      }).catch(() => {});
    }
  }, [ingestTelemetry, addSimPacket]);

  // Auto-stream
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(sendOne, interval);
    return () => clearInterval(id);
  }, [streaming, interval, sendOne]);

  const fireScenario = (kind: 'complete' | 'empty') => {
    const { device: dev } = cfg.current;
    if (!dev) return;
    // First a "producing" frame so the 1→0 transition is detectable
    if (kind === 'complete') {
      ingestTelemetry(dev.secret_token, buildDataString({ ...realisticFrame(0), level_sensor_1: 1, level_sensor_2: 0, level_sensor_3: 0 }));
    }
    const frame: ParsedFrame = kind === 'complete'
      ? { flow_rate: 0, voltage: 12.3, level_sensor_1: 0, level_sensor_2: 0, level_sensor_3: 0, naclo_pumped: 0, target_frc: 1, active_chlorine: 0.8, ph_value: 7.1 }
      : { flow_rate: 0, voltage: 12.1, level_sensor_1: 0, level_sensor_2: 0, level_sensor_3: 1, naclo_pumped: 0, target_frc: 1, active_chlorine: 0.1, ph_value: 7.3 };
    const dataStr = buildDataString(frame);
    const res = ingestTelemetry(dev.secret_token, dataStr);
    addSimPacket({
      id: `sim-${Date.now()}`, token: dev.secret_token, device_name: dev.name,
      raw_payload: `token=${dev.secret_token}&data=${dataStr}`, data_string: dataStr,
      timestamp: new Date().toISOString(), status: res.ok ? 'ok' : 'error', error: res.error,
    });
  };

  const previewFrame = mode === 'realistic' ? realisticFrame(phaseRef.current + 1) : manual;
  const previewPayload = device ? `token=${device.secret_token}&data=${buildDataString(previewFrame)}` : '';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 ring-4 ring-brand-50/60"><Radio size={22} /></span>
        <div>
          <h2 className="text-lg font-bold text-ink">Telemetry Simulator</h2>
          <p className="text-sm text-slate-500">Emulate SIM800L field-node POSTs to test the live dashboards & alarms</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Controls */}
        <div className="xl:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Target device</span>
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="input mt-1.5">
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            <div>
              <span className="text-sm font-medium text-slate-700">Frame source</span>
              <div className="mt-1.5 flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                {(['realistic', 'manual'] as Mode[]).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-semibold capitalize transition-colors cursor-pointer', mode === m ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink')}>{m}</button>
                ))}
              </div>
            </div>

            {mode === 'manual' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                {MANUAL_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="text-xs font-medium text-slate-600">{f.label}</span>
                    {f.binary ? (
                      <select value={manual[f.key]} onChange={(e) => setManual({ ...manual, [f.key]: +e.target.value as any })} className="input mt-1 py-1.5 text-sm">
                        <option value={0}>0</option><option value={1}>1</option>
                      </select>
                    ) : (
                      <input type="number" min={f.min} max={f.max} step={f.step} value={manual[f.key]} onChange={(e) => setManual({ ...manual, [f.key]: +e.target.value as any })} className="input mt-1 py-1.5 text-sm font-mono" />
                    )}
                  </label>
                ))}
              </div>
            )}

            {/* Stream controls */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Stream interval</span>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100">
                  {INTERVALS.map((i) => (
                    <button key={i.ms} onClick={() => setIntervalMs(i.ms)} className={cn('px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer', interval === i.ms ? 'bg-white text-ink shadow-sm' : 'text-slate-500')}>{i.label}</button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={hitEndpoint} onChange={(e) => setHitEndpoint(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-slate-600 inline-flex items-center gap-1.5"><Server size={14} className="text-slate-400" /> Also POST to live <code className="font-mono text-xs text-brand-600">/api/ingest</code></span>
              </label>

              <div className="flex items-center gap-2">
                <button onClick={() => setStreaming((s) => !s)} className={cn('btn flex-1 px-4 py-2.5', streaming ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-brand-600 text-white hover:bg-brand-700')}>
                  {streaming ? <><Pause size={16} /> Stop stream</> : <><Play size={16} /> Start stream</>}
                </button>
                <button onClick={sendOne} disabled={streaming} className="btn-outline py-2.5"><Send size={15} /> Send 1</button>
              </div>
            </div>
          </div>

          {/* Scenario triggers */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-ink flex items-center gap-1.5"><Zap size={15} className="text-amber-500" /> Alarm scenarios</p>
            <p className="text-xs text-slate-400 mt-0.5 mb-3">Fire the two PDF-defined alarm conditions on demand.</p>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => fireScenario('complete')} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-amber-300 hover:bg-amber-50/50 transition-colors cursor-pointer text-left">
                <FlaskConical size={16} className="text-amber-500 shrink-0" />
                <div><p className="text-sm font-medium text-ink">Production complete</p><p className="text-xs text-slate-400">Level 1 toggles 1→0, Level 2 = 0</p></div>
              </button>
              <button onClick={() => fireScenario('empty')} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-rose-300 hover:bg-rose-50/50 transition-colors cursor-pointer text-left">
                <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                <div><p className="text-sm font-medium text-ink">NaClO depleted</p><p className="text-xs text-slate-400">Level 3 = 1 (empty storage tank)</p></div>
              </button>
            </div>
          </div>
        </div>

        {/* Live console */}
        <div className="xl:col-span-3 space-y-4">
          {/* Payload preview */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-ink text-white/80 text-xs font-semibold">
              <Cpu size={13} className="text-brand-300" /> Next payload preview
              {streaming && <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" /> streaming · {INTERVALS.find((i) => i.ms === interval)?.label}</span>}
            </div>
            <pre className="p-4 bg-slate-900 text-[12.5px] leading-relaxed overflow-x-auto"><code className="font-mono text-slate-300 break-all whitespace-pre-wrap">{previewPayload || 'Select a device…'}</code></pre>
          </div>

          {/* Sent ledger */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wifi size={16} className="text-brand-600" />
                <h3 className="text-sm font-bold text-ink">Transmitted Packets</h3>
                <span className="chip bg-slate-100 text-slate-500">{simPackets.length}</span>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
              {simPackets.length === 0 && (
                <p className="px-5 py-12 text-center text-sm text-slate-400">No packets sent yet. Hit <strong>Send 1</strong> or <strong>Start stream</strong>.</p>
              )}
              {simPackets.map((p) => (
                <div key={p.id} className="px-5 py-2.5 slide-in hover:bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', p.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">{fmtTime(p.timestamp)}</span>
                    <span className="text-xs text-slate-600 truncate">{p.device_name}</span>
                    {p.status === 'error' && <span className="ml-auto text-[11px] text-rose-500">{p.error}</span>}
                  </div>
                  <code className="block mt-1 font-mono text-[11px] text-slate-500 break-all">{p.data_string}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
