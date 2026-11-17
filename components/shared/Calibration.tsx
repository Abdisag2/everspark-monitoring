'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SlidersHorizontal, Cpu, RefreshCw, Lock, Save, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, Droplet, ShieldAlert,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MAIN_PARAMS, DOSING_READ_PARAMS, parseParamDump, type ParsedParam } from '@/lib/calibration';
import type { DeviceCommand, CommandStatus } from '@/lib/types';

const PENDING: CommandStatus[] = ['queued', 'sent'];

function StatusBadge({ status }: { status: CommandStatus }) {
  const map: Record<CommandStatus, { cls: string; icon: JSX.Element; label: string }> = {
    queued:   { cls: 'bg-slate-100 text-slate-600',   icon: <Clock size={12} />,                       label: 'Queued' },
    sent:     { cls: 'bg-amber-100 text-amber-700',    icon: <Loader2 size={12} className="animate-spin" />, label: 'Sent' },
    acked:    { cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={12} />,               label: 'Done' },
    error:    { cls: 'bg-rose-100 text-rose-700',       icon: <XCircle size={12} />,                     label: 'Error' },
    timeout:  { cls: 'bg-rose-100 text-rose-700',       icon: <AlertTriangle size={12} />,               label: 'No answer' },
    canceled: { cls: 'bg-slate-100 text-slate-500',     icon: <XCircle size={12} />,                     label: 'Canceled' },
  };
  const m = map[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>{m.icon}{m.label}</span>;
}

export function Calibration() {
  const { currentUser, getVisibleDevices, queueDeviceCommand, deviceCommands } = useApp();
  const devices = getVisibleDevices();

  const [deviceId, setDeviceId] = useState<string>(devices[0]?.id ?? '');
  const [readMainId, setReadMainId] = useState<string | null>(null);
  const [readDosingId, setReadDosingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ name: string; label: string; oldVal?: number; newVal: number; unit: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const device = devices.find((d) => d.id === deviceId);

  // Commands for this device, newest first (already ordered in context, but be safe).
  const cmds = useMemo(
    () => deviceCommands
      .filter((c) => c.device_id === deviceId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [deviceCommands, deviceId],
  );

  const mainCmd = useMemo(() => deviceCommands.find((c) => c.id === readMainId), [deviceCommands, readMainId]);
  const dosingCmd = useMemo(() => deviceCommands.find((c) => c.id === readDosingId), [deviceCommands, readDosingId]);
  const reading = !!(mainCmd && PENDING.includes(mainCmd.status)) || !!(dosingCmd && PENDING.includes(dosingCmd.status));

  // Parse the last read into current values (name → parsed).
  const values = useMemo<Record<string, ParsedParam>>(() => {
    const out: Record<string, ParsedParam> = {};
    if (mainCmd?.status === 'acked' && mainCmd.response) Object.assign(out, parseParamDump(mainCmd.response));
    if (dosingCmd?.status === 'acked' && dosingCmd.response) Object.assign(out, parseParamDump(dosingCmd.response));
    return out;
  }, [mainCmd, dosingCmd]);

  const hasRead = Object.keys(values).length > 0;

  // Seed edit buffers whenever a fresh read lands.
  useEffect(() => {
    if (!hasRead) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of MAIN_PARAMS) if (values[p.name]) next[p.name] = String(values[p.name].value);
      return next;
    });
  }, [hasRead, values]);

  // Reset state when the selected device changes.
  useEffect(() => {
    setReadMainId(null); setReadDosingId(null); setEdits({}); setConfirm(null); setSavingId(null);
  }, [deviceId]);

  const readConfig = async () => {
    if (!device) return;
    const a = await queueDeviceCommand(device.id, 'get');
    const b = await queueDeviceCommand(device.id, 'dosing get');
    if (a.ok && a.id) setReadMainId(a.id);
    if (b.ok && b.id) setReadDosingId(b.id);
  };

  const requestSet = (name: string) => {
    const meta = MAIN_PARAMS.find((p) => p.name === name)!;
    const raw = edits[name];
    const newVal = Number(raw);
    const cur = values[name];
    const min = cur?.min ?? meta.min;
    const max = cur?.max ?? meta.max;
    if (raw === '' || !Number.isFinite(newVal)) return;
    if (newVal < min || newVal > max) return; // out-of-range handled inline below
    if (cur && newVal === cur.value) return;   // no change
    setConfirm({ name, label: meta.label, oldVal: cur?.value, newVal, unit: cur?.unit || meta.unit });
  };

  const applySet = async () => {
    if (!confirm || !device) return;
    const res = await queueDeviceCommand(device.id, `set ${confirm.name} ${confirm.newVal}`);
    setConfirm(null);
    if (res.ok && res.id) setSavingId(res.id);
  };

  // When the pending set finishes, re-run a read so the table reflects the device's truth.
  const savingCmd = useMemo(() => deviceCommands.find((c) => c.id === savingId), [deviceCommands, savingId]);
  useEffect(() => {
    if (savingCmd && savingCmd.status === 'acked') { setSavingId(null); readConfig(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savingCmd?.status]);

  if (currentUser.role === 'viewer') {
    return (
      <div className="max-w-2xl card p-6 text-sm text-slate-500">
        Remote calibration is available to managers and administrators.
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 ring-4 ring-brand-50/60">
          <SlidersHorizontal size={22} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">Remote Calibration</h2>
          <p className="text-sm text-slate-500">Read a Clara unit&apos;s settings and change them over the air</p>
        </div>
      </div>

      {/* Safety note */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-800">
          Settings are applied to live field hardware. A command only takes effect when the unit is online and
          in remote mode — otherwise it waits and then times out. Chlorine &amp; dosing calibration is shown
          read-only in this version.
        </p>
      </div>

      {/* Device picker + read */}
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Device</span>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
            >
              {devices.length === 0 && <option value="">No devices</option>}
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <button onClick={readConfig} disabled={!device || reading} className="btn-primary py-2.5 disabled:opacity-50">
            {reading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {reading ? 'Reading…' : hasRead ? 'Re-read configuration' : 'Read configuration'}
          </button>
        </div>
        {!hasRead && !reading && (
          <p className="text-xs text-slate-400">Read the device&apos;s current configuration to begin.</p>
        )}
        {(mainCmd?.status === 'timeout' || dosingCmd?.status === 'timeout') && (
          <p className="text-xs text-rose-600">The device didn&apos;t answer. It may be offline or not yet in remote mode — try again shortly.</p>
        )}
      </div>

      {/* Main-board parameters */}
      {hasRead && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-ink">Main-board settings</p>
          <div className="space-y-2">
            {MAIN_PARAMS.map((p) => {
              const cur = values[p.name];
              const min = cur?.min ?? p.min;
              const max = cur?.max ?? p.max;
              const unit = cur?.unit || p.unit;
              const buf = edits[p.name] ?? (cur ? String(cur.value) : '');
              const num = Number(buf);
              const outOfRange = buf !== '' && Number.isFinite(num) && (num < min || num > max);
              const changed = cur != null && buf !== '' && Number.isFinite(num) && num !== cur.value && !outOfRange;
              return (
                <div key={p.name} className="rounded-xl border border-slate-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{p.label}</span>
                        {!p.settable && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500" title={p.lockReason}>
                            <Lock size={10} /> locked
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{cur?.help || p.help}{unit ? ` · ${unit}` : ''} · range {min}–{max}</p>
                    </div>
                    {p.settable ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number" value={buf} step="any" min={min} max={max}
                          onChange={(e) => setEdits((s) => ({ ...s, [p.name]: e.target.value }))}
                          className={`w-24 rounded-lg border px-2 py-1.5 text-sm text-right text-ink focus:outline-none ${outOfRange ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-brand-400'}`}
                        />
                        <button
                          onClick={() => requestSet(p.name)} disabled={!changed}
                          className="btn-outline py-1.5 px-2.5 text-xs disabled:opacity-40"
                        >
                          <Save size={13} /> Save
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 font-mono text-sm text-slate-500">{cur ? cur.value : p.demo}{unit ? ` ${unit}` : ''}</span>
                    )}
                  </div>
                  {outOfRange && <p className="mt-1 text-[11px] text-rose-600">Out of range ({min}–{max}).</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dosing / chlorine (read-only in v1) */}
      {hasRead && DOSING_READ_PARAMS.some((p) => values[p.name]) && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Droplet size={16} className="text-brand-500" />
            <p className="text-sm font-semibold text-ink">Chlorine &amp; dosing</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">read-only</span>
          </div>
          <div className="space-y-2">
            {DOSING_READ_PARAMS.filter((p) => values[p.name]).map((p) => {
              const cur = values[p.name];
              return (
                <div key={p.name} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-ink">{p.label}</span>
                    <p className="text-[11px] text-slate-400">{cur?.help || p.help}</p>
                  </div>
                  <span className="font-mono text-sm text-slate-600">{cur?.value}{(cur?.unit || p.unit) ? ` ${cur?.unit || p.unit}` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity / audit */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-ink">Recent commands</p>
        {cmds.length === 0 && <p className="text-xs text-slate-400">No commands sent to this device yet.</p>}
        <div className="space-y-2">
          {cmds.slice(0, 12).map((c) => <CommandRow key={c.id} c={c} />)}
        </div>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-amber-50 text-amber-600"><ShieldAlert size={18} /></span>
              <p className="text-sm font-bold text-ink">Apply this change?</p>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-ink">{confirm.label}</p>
              <p className="mt-1 text-slate-600">
                {confirm.oldVal != null ? <><span className="font-mono">{confirm.oldVal}{confirm.unit && ` ${confirm.unit}`}</span> → </> : null}
                <span className="font-mono font-semibold text-brand-600">{confirm.newVal}{confirm.unit && ` ${confirm.unit}`}</span>
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-400">set {confirm.name} {confirm.newVal}</p>
            </div>
            <p className="mt-3 text-xs text-slate-500">This is sent to {device?.name} and takes effect on the live unit.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-outline py-2 px-3 text-sm">Cancel</button>
              <button onClick={applySet} className="btn-primary py-2 px-3 text-sm">Send to device</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommandRow({ c }: { c: DeviceCommand }) {
  const when = new Date(c.created_at).toLocaleString();
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <code className="truncate text-xs font-semibold text-ink">{c.command}</code>
        <StatusBadge status={c.status} />
      </div>
      {c.response && (
        <pre className={`mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${c.status === 'error' || c.status === 'timeout' ? 'text-rose-600' : 'text-slate-500'}`}>{c.response}</pre>
      )}
      <p className="mt-1 text-[10px] text-slate-400">{when}</p>
    </div>
  );
}
