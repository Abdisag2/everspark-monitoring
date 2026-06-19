'use client';

import { useMemo, useState } from 'react';
import {
  Cpu, Plus, Pencil, Trash2, Search, KeyRound, RefreshCw, Radio, MapPin, Eye, EyeOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Modal } from '@/components/shared/Modal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CopyButton } from '@/components/shared/CopyButton';
import { buildDataString, timeAgo, cn, parseLatLng } from '@/lib/utils';
import type { Device } from '@/lib/types';

const SAMPLE_FRAME = buildDataString({
  flow_rate: 50, voltage: 12.5, level_sensor_1: 1, level_sensor_2: 0, level_sensor_3: 1,
  naclo_pumped: 110.5, target_frc: 1.0, active_chlorine: 0.5, ph_value: 7.2,
});

interface FormState { name: string; organization_id: string; location: string; system_id: string; }
const EMPTY: FormState = { name: '', organization_id: '', location: '', system_id: '' };

export function DeviceConfiguration({ scopeOrgId }: { scopeOrgId?: string }) {
  const { devices, organizations, addDevice, updateDevice, deleteDevice, regenerateToken, setPanel } = useApp();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState<Device | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [tokenFor, setTokenFor] = useState<Device | null>(null);
  const [regenFor, setRegenFor] = useState<Device | null>(null);
  const [reveal, setReveal] = useState(false);

  const orgOptions = scopeOrgId ? organizations.filter((o) => o.id === scopeOrgId) : organizations;
  const orgName = (id: string) => organizations.find((o) => o.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return devices
      .filter((d) => (scopeOrgId ? d.organization_id === scopeOrgId : true))
      .filter((d) => d.name.toLowerCase().includes(q) || (d.location ?? '').toLowerCase().includes(q) || (d.system_id ?? '').toLowerCase().includes(q));
  }, [devices, query, scopeOrgId]);

  const openCreate = () => { setForm({ ...EMPTY, organization_id: scopeOrgId ?? orgOptions[0]?.id ?? '' }); setCreating(true); };
  const openEdit = (d: Device) => {
    const loc = d.latitude != null && d.longitude != null ? `${d.latitude}, ${d.longitude}` : (d.location ?? '');
    setForm({ name: d.name, organization_id: d.organization_id, location: loc, system_id: d.system_id ?? '' });
    setEditing(d);
  };
  const tokenDevice = tokenFor ? devices.find((d) => d.id === tokenFor.id) ?? tokenFor : null;
  const locCoords = parseLatLng(form.location);

  const save = () => {
    if (!form.name.trim() || !form.organization_id) return;
    const coords = parseLatLng(form.location);
    const common = {
      location: form.location.trim() || undefined,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
    };
    if (editing) {
      updateDevice(editing.id, { name: form.name.trim(), organization_id: form.organization_id, system_id: form.system_id.trim(), ...common });
    } else {
      const created = addDevice({ name: form.name.trim(), organization_id: form.organization_id, system_id: form.system_id.trim() || undefined, ...common });
      setTokenFor(created); setReveal(true);
    }
    setEditing(null); setCreating(false);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Device Registry</h2>
          <p className="text-sm text-slate-500">{rows.length} hardware node{rows.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search devices…" className="input pl-9 py-2 w-full sm:w-64" />
          </div>
          <button onClick={openCreate} className="btn-primary whitespace-nowrap"><Plus size={16} /> Register</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="text-left font-semibold px-5 py-3">Device</th>
                {!scopeOrgId && <th className="text-left font-semibold px-3 py-3">Organization</th>}
                <th className="text-left font-semibold px-3 py-3">Location</th>
                <th className="text-left font-semibold px-3 py-3">Status</th>
                <th className="text-left font-semibold px-3 py-3">Last seen</th>
                <th className="text-left font-semibold px-3 py-3">Token</th>
                <th className="text-right font-semibold px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3">
                    <button onClick={() => setPanel({ view: 'device-monitoring', deviceId: d.id, backView: 'devices' })} className="text-left group cursor-pointer">
                      <p className="font-medium text-ink group-hover:text-brand-600 transition-colors max-w-[220px] truncate" title={d.name}>{d.name}</p>
                      {d.system_id && <p className="text-xs text-slate-400 font-mono">{d.system_id}</p>}
                    </button>
                  </td>
                  {!scopeOrgId && <td className="px-3 py-3 text-slate-600 max-w-[160px] truncate" title={orgName(d.organization_id)}>{orgName(d.organization_id)}</td>}
                  <td className="px-3 py-3 text-slate-500">
                    {d.location ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{d.location}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3"><StatusBadge online={d.status === 'online'} /></td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{timeAgo(d.last_seen)}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => { setTokenFor(d); setReveal(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-500 hover:bg-slate-200 hover:text-ink transition-colors cursor-pointer" title="View token & flashing details">
                      <KeyRound size={12} /> ••••{d.secret_token.slice(-4)}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button onClick={() => setRegenFor(d)} className="btn-ghost p-1.5 rounded-lg" title="Regenerate token"><RefreshCw size={15} /></button>
                      <button onClick={() => openEdit(d)} className="btn-ghost p-1.5 rounded-lg" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => setDeleting(d)} className="btn-ghost p-1.5 rounded-lg hover:text-rose-500" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">
                  <Cpu size={26} className="mx-auto text-slate-300 mb-2" /> No devices registered yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit device modal */}
      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? 'Edit Device' : 'Register Device'}
        description={editing ? 'Update this hardware node.' : 'Register a physical Clara field node and link it to an organization.'}
        size="lg"
        footer={
          <>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-outline">Cancel</button>
            <button onClick={save} disabled={!form.name.trim() || !form.organization_id} className="btn-primary">{editing ? 'Save changes' : 'Register & generate token'}</button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Device name</span>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='Clara-MWA "Korata" (CI-4824-01)' className="input mt-1.5" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Organization</span>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} disabled={!!scopeOrgId} className="input mt-1.5 disabled:bg-slate-50 disabled:text-slate-400">
              <option value="" disabled>Select organization…</option>
              {orgOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">System ID <span className="text-slate-400 font-normal">(optional)</span></span>
            <input value={form.system_id} onChange={(e) => setForm({ ...form, system_id: e.target.value })} placeholder="m350349272" className="input mt-1.5 font-mono" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Location <span className="text-slate-400 font-normal">— Google Maps link or GPS coordinates</span></span>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="9.0300, 38.7400  or  https://maps.google.com/?q=9.03,38.74" className="input mt-1.5" />
            {form.location.trim() && (
              locCoords ? (
                <p className="mt-1.5 text-xs text-emerald-600 inline-flex items-center gap-1">
                  <MapPin size={12} /> Pinned at {locCoords.lat.toFixed(5)}, {locCoords.lng.toFixed(5)} — shows on the Sites Map
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">No coordinates detected — paste a Maps link with <code className="font-mono">@lat,lng</code> / <code className="font-mono">?q=lat,lng</code>, or type <code className="font-mono">lat, lng</code>. (Shortened goo.gl links won't work.)</p>
              )
            )}
          </label>
        </div>
      </Modal>

      {/* Token / flashing details modal */}
      <Modal
        open={!!tokenFor}
        onClose={() => setTokenFor(null)}
        title="Device Secret Token"
        description="Flash this token onto the SIM800L node. It authenticates every telemetry POST."
        size="lg"
        footer={<button onClick={() => setTokenFor(null)} className="btn-primary">Done</button>}
      >
        {tokenDevice && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><KeyRound size={13} /> secret_token</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setReveal((r) => !r)} className="btn-ghost p-1.5 rounded-lg" title={reveal ? 'Hide' : 'Reveal'}>{reveal ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  <CopyButton value={tokenDevice.secret_token} label="Copy" />
                </div>
              </div>
              <p className="font-mono text-sm text-ink break-all">{reveal ? tokenDevice.secret_token : `${'•'.repeat(28)}${tokenDevice.secret_token.slice(-4)}`}</p>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-ink text-white/80 text-xs font-semibold">
                <Radio size={13} className="text-brand-300" /> SIM800L POST payload
              </div>
              <pre className="p-4 bg-slate-900 text-[12.5px] leading-relaxed overflow-x-auto"><code className="font-mono text-slate-300">{`POST /api/ingest HTTP/1.1
Host: <your-deployment>
User-Agent: field-node
ngrok-skip-browser-warning: 69420
Content-Type: application/x-www-form-urlencoded

`}<span className="text-brand-300">token</span>=<span className="text-amber-300">{reveal ? tokenDevice.secret_token : `••••${tokenDevice.secret_token.slice(-4)}`}</span>&<span className="text-brand-300">data</span>=<span className="text-emerald-300">{SAMPLE_FRAME}</span></code></pre>
            </div>
            <p className="text-xs text-slate-400">Frame order: flow, voltage, level1, level2, level3, NaClO, target FRC, active Cl₂, pH — wrapped <code className="font-mono">;…:</code></p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!regenFor}
        onClose={() => setRegenFor(null)}
        onConfirm={() => { if (regenFor) { regenerateToken(regenFor.id); setTokenFor(regenFor); setReveal(true); } }}
        title="Regenerate token?"
        confirmLabel="Regenerate"
        danger
        message={<>The current token for <strong className="text-ink">{regenFor?.name}</strong> stops working immediately. You must re-flash the node with the new token.</>}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteDevice(deleting.id)}
        title="Delete device?"
        message={<>This removes <strong className="text-ink">{deleting?.name}</strong> and its telemetry history from the registry. This cannot be undone.</>}
      />
    </div>
  );
}
