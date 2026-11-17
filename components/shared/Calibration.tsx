'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SlidersHorizontal, Lock, Save, CheckCircle2, XCircle, RefreshCw,
  Clock, Loader2, AlertTriangle, Droplet, ShieldAlert, Power,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MAIN_PARAMS, DOSING_PARAMS, parseParamDump, type ParsedParam } from '@/lib/calibration';
import type { DeviceCommand, CommandStatus } from '@/lib/types';

const PENDING: CommandStatus[] = ['queued', 'sent'];

function StatusBadge({ status }: { status: CommandStatus }) {
  const map: Record<CommandStatus, { cls: string; icon: JSX.Element; label: string }> = {
    queued:   { cls: 'bg-slate-100 text-slate-600',   icon: <Clock size={12} />,                            label: 'Queued' },
    sent:     { cls: 'bg-amber-100 text-amber-700',    icon: <Loader2 size={12} className="animate-spin" />, label: 'Sent' },
    acked:    { cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={12} />,                    label: 'Done' },
    error:    { cls: 'bg-rose-100 text-rose-700',       icon: <XCircle size={12} />,                          label: 'Error' },
    timeout:  { cls: 'bg-rose-100 text-rose-700',       icon: <AlertTriangle size={12} />,                    label: 'No answer' },
    canceled: { cls: 'bg-slate-100 text-slate-500',     icon: <XCircle size={12} />,                          label: 'Canceled' },
  };
  const m = map[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>{m.icon}{m.label}</span>;
}

interface RowMeta { name: string; label: string; unit: string; min: number; max: number; help: string; lockReason?: string; }

export function Calibration() {
  const { currentUser, getVisibleDevices, queueDeviceCommand, deviceCommands } = useApp();
  const devices = getVisibleDevices();
  const isAdmin = currentUser.role === 'admin';

  const [deviceId, setDeviceId] = useState<string>(devices[0]?.id ?? '');
  const [readMainId, setReadMainId] = useState<string | null>(null);
  const [readDosingId, setReadDosingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ name: string; label: string; oldVal?: number; newVal: number; unit: string; dosing: boolean } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [restartTarget, setRestartTarget] = useState<'main' | 'dosing' | null>(null);

  const device = devices.find((d) => d.id === deviceId);

  const cmds = useMemo(
    () => deviceCommands
      .filter((c) => c.device_id === deviceId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [deviceCommands, deviceId],
  );

  const mainCmd = useMemo(() => deviceCommands.find((c) => c.id === readMainId), [deviceCommands, readMainId]);
  const dosingCmd = useMemo(() => deviceCommands.find((c) => c.id === readDosingId), [deviceCommands, readDosingId]);
  const reading = !!(mainCmd && PENDING.includes(mainCmd.status)) || !!(dosingCmd && PENDING.includes(dosingCmd.status));

  const mainValues = useMemo<Record<string, ParsedParam>>(
    () => (mainCmd?.status === 'acked' && mainCmd.response ? parseParamDump(mainCmd.response) : {}),
    [mainCmd],
  );
  const dosingValues = useMemo<Record<string, ParsedParam>>(
    () => (dosingCmd?.status === 'acked' && dosingCmd.response ? parseParamDump(dosingCmd.response) : {}),
    [dosingCmd],
  );
  const hasRead = Object.keys(mainValues).length > 0 || Object.keys(dosingValues).length > 0;

  // Seed edit buffers whenever a fresh read lands.
  useEffect(() => {
    if (!hasRead) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of MAIN_PARAMS) if (mainValues[p.name]) next[p.name] = String(mainValues[p.name].value);
      for (const p of DOSING_PARAMS) if (dosingValues[p.name]) next[p.name] = String(dosingValues[p.name].value);
      return next;
    });
  }, [hasRead, mainValues, dosingValues]);

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

  const requestSet = (name: string, dosing: boolean) => {
    const meta = (dosing ? DOSING_PARAMS : MAIN_PARAMS).find((p) => p.name === name)!;
    const cur = (dosing ? dosingValues : mainValues)[name];
    const raw = edits[name];
    const newVal = Number(raw);
    const min = cur?.min ?? meta.min;
    const max = cur?.max ?? meta.max;
    if (raw === '' || !Number.isFinite(newVal)) return;
    if (newVal < min || newVal > max) return;
    if (cur && newVal === cur.value) return;
    setConfirm({ name, label: meta.label, oldVal: cur?.value, newVal, unit: cur?.unit || meta.unit, dosing });
  };

  const applySet = async () => {
    if (!confirm || !device) return;
    const line = confirm.dosing ? `dosing set ${confirm.name} ${confirm.newVal}` : `set ${confirm.name} ${confirm.newVal}`;
    const res = await queueDeviceCommand(device.id, line);
    setConfirm(null);
    if (res.ok && res.id) setSavingId(res.id);
  };

  // Restart does not re-read (the board is rebooting) — just queue it.
  const doRestart = async () => {
    if (!device || !restartTarget) return;
    await queueDeviceCommand(device.id, restartTarget === 'main' ? 'restart' : 'dosing restart');
    setRestartTarget(null);
  };

  // After a set finishes, re-read so the tables reflect the device's truth.
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

  // One parameter row (editable input + Save, or a read-only value).
  const paramRow = (meta: RowMeta, cur: ParsedParam | undefined, editable: boolean, dosing: boolean) => {
    const min = cur?.min ?? meta.min;
    const max = cur?.max ?? meta.max;
    const unit = cur?.unit || meta.unit;
    const buf = edits[meta.name] ?? (cur ? String(cur.value) : '');
    const num = Number(buf);
    const outOfRange = buf !== '' && Number.isFinite(num) && (num < min || num > max);
    const changed = cur != null && buf !== '' && Number.isFinite(num) && num !== cur.value && !outOfRange;
    return (
      <div key={meta.name} className="rounded-xl border border-slate-200 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-ink">{meta.label}</span>
              {meta.lockReason && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500" title={meta.lockReason}>
                  <Lock size={10} /> locked
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">{cur?.help || meta.help}{unit ? ` · ${unit}` : ''} · range {min}–{max}</p>
          </div>
          {editable ? (
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number" value={buf} step="any" min={min} max={max}
                onChange={(e) => setEdits((s) => ({ ...s, [meta.name]: e.target.value }))}
                className={`w-24 rounded-lg border px-2 py-1.5 text-sm text-right text-ink focus:outline-none ${outOfRange ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-brand-400'}`}
              />
              <button onClick={() => requestSet(meta.name, dosing)} disabled={!changed} className="btn-outline py-1.5 px-2.5 text-xs disabled:opacity-40">
                <Save size={13} /> Save
              </button>
            </div>
          ) : (
            <span className="shrink-0 font-mono text-sm text-slate-500">{cur ? cur.value : meta.min}{unit ? ` ${unit}` : ''}</span>
          )}
        </div>
        {outOfRange && <p className="mt-1 text-[11px] text-rose-600">Out of range ({min}–{max}).</p>}
      </div>
    );
  };

  const dosingShown = DOSING_PARAMS.filter((p) => dosingValues[p.name]);

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
          in remote mode — otherwise it waits and then times out.
          {isAdmin
            ? ' Chlorine & dosing settings change how the water is treated — change them with care.'
            : ' Chlorine & dosing calibration is read-only for your role.'}
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
        {!hasRead && !reading && <p className="text-xs text-slate-400">Read the device&apos;s current configuration to begin.</p>}
        {(mainCmd?.status === 'timeout' || dosingCmd?.status === 'timeout') && (
          <p className="text-xs text-rose-600">The device didn&apos;t answer. It may be offline or not yet in remote mode — try again shortly.</p>
        )}
      </div>

      {/* Main-board parameters */}
      {Object.keys(mainValues).length > 0 && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-ink">Main-board settings</p>
          <div className="space-y-2">
            {MAIN_PARAMS.map((p) => paramRow(p, mainValues[p.name], p.settable, false))}
          </div>
        </div>
      )}

      {/* Dosing / chlorine */}
      {dosingShown.length > 0 && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Droplet size={16} className="text-brand-500" />
            <p className="text-sm font-semibold text-ink">Chlorine &amp; dosing</p>
            {isAdmin
              ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">affects water treatment</span>
              : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">read-only</span>}
          </div>
          <div className="space-y-2">
            {dosingShown.map((p) => paramRow(p, dosingValues[p.name], isAdmin, true))}
          </div>
        </div>
      )}

      {/* Restart (admin only) */}
      {isAdmin && device && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Power size={16} className="text-rose-500" />
            <p className="text-sm font-semibold text-ink">Restart</p>
          </div>
          <p className="text-xs text-slate-400">
            Reboot a board remotely. The main board keeps its running batch; the dosing board keeps its calibration.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRestartTarget('main')} className="btn-outline py-2">
              <Power size={14} /> Restart main board
            </button>
            <button onClick={() => setRestartTarget('dosing')} className="btn-outline py-2">
              <Power size={14} /> Restart dosing board
            </button>
          </div>
        </div>
      )}

      {/* Activity / audit */}
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-ink">Recent commands</p>
        {cmds.length === 0 && <p className="text-xs text-slate-400">No commands sent to this device yet.</p>}
        <div className="space-y-2">{cmds.slice(0, 12).map((c) => <CommandRow key={c.id} c={c} />)}</div>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <span className={`grid place-items-center h-9 w-9 rounded-xl ${confirm.dosing ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                {confirm.dosing ? <Droplet size={18} /> : <ShieldAlert size={18} />}
              </span>
              <p className="text-sm font-bold text-ink">{confirm.dosing ? 'Change chlorine / dosing?' : 'Apply this change?'}</p>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-ink">{confirm.label}</p>
              <p className="mt-1 text-slate-600">
                {confirm.oldVal != null ? <><span className="font-mono">{confirm.oldVal}{confirm.unit && ` ${confirm.unit}`}</span> → </> : null}
                <span className={`font-mono font-semibold ${confirm.dosing ? 'text-rose-600' : 'text-brand-600'}`}>{confirm.newVal}{confirm.unit && ` ${confirm.unit}`}</span>
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-400">{confirm.dosing ? 'dosing ' : ''}set {confirm.name} {confirm.newVal}</p>
            </div>
            {confirm.dosing
              ? <p className="mt-3 text-xs text-rose-600">This changes how the dosing board treats the water — it affects the chlorine delivered into the supply at {device?.name}.</p>
              : <p className="mt-3 text-xs text-slate-500">This is sent to {device?.name} and takes effect on the live unit.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-outline py-2 px-3 text-sm">Cancel</button>
              <button onClick={applySet} className={`py-2 px-3 text-sm text-white rounded-xl font-semibold ${confirm.dosing ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'}`}>
                Send to device
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart confirm modal */}
      {restartTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setRestartTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-rose-50 text-rose-600"><Power size={18} /></span>
              <p className="text-sm font-bold text-ink">{restartTarget === 'main' ? 'Restart the main board?' : 'Restart the dosing board?'}</p>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {restartTarget === 'main'
                ? <>The main board at <b>{device?.name}</b> will reboot now. The running batch is saved and continues after it comes back; the unit is unreachable for a few seconds.</>
                : <>The dosing board at <b>{device?.name}</b> will reboot now. Its calibration is kept, but the water &amp; NaClO totals reset to 0.</>}
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate-400">{restartTarget === 'main' ? 'restart' : 'dosing restart'}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRestartTarget(null)} className="btn-outline py-2 px-3 text-sm">Cancel</button>
              <button onClick={doRestart} className="py-2 px-3 text-sm text-white rounded-xl font-semibold bg-rose-600 hover:bg-rose-700">Restart</button>
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
