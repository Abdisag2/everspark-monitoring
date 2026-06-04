'use client';

import { useState } from 'react';
import { Building2, Save, Calendar, Cpu, Users, Hash, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { CopyButton } from '@/components/shared/CopyButton';

export function OrgSettings() {
  const { currentUser, organizations, devices, profiles, updateOrg } = useApp();
  const org = organizations.find((o) => o.id === currentUser.organization_id);
  const [name, setName] = useState(org?.name ?? '');
  const [saved, setSaved] = useState(false);

  if (!org) return <div className="card p-12 text-center text-slate-400">No organization found.</div>;

  const deviceCount = devices.filter((d) => d.organization_id === org.id).length;
  const memberCount = profiles.filter((p) => p.organization_id === org.id).length;
  const dirty = name.trim() !== org.name && name.trim().length > 0;

  const save = () => {
    if (!dirty) return;
    updateOrg(org.id, name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-accent-50 text-accent-600 ring-4 ring-accent-50/60">
          <Building2 size={22} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">Organization Settings</h2>
          <p className="text-sm text-slate-500">Manage details for your organization</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <Cpu size={16} className="text-brand-600" />
          <p className="mt-2 text-2xl font-bold text-ink">{deviceCount}</p>
          <p className="text-xs text-slate-400">Devices</p>
        </div>
        <div className="card p-4">
          <Users size={16} className="text-violet-600" />
          <p className="mt-2 text-2xl font-bold text-ink">{memberCount}</p>
          <p className="text-xs text-slate-400">Members</p>
        </div>
        <div className="card p-4">
          <Calendar size={16} className="text-accent-600" />
          <p className="mt-2 text-sm font-bold text-ink">{new Date(org.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          <p className="text-xs text-slate-400">Created</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Organization name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1.5" />
        </label>

        <div>
          <span className="text-sm font-medium text-slate-700">Organization ID</span>
          <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <span className="font-mono text-sm text-slate-500 flex items-center gap-2"><Hash size={14} className="text-slate-400" />{org.id}</span>
            <CopyButton value={org.id} label="Copy" />
          </div>
          <p className="mt-1 text-xs text-slate-400">Used for RLS tenancy scoping. Read-only.</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check size={15} /> Saved</span>}
          <button onClick={save} disabled={!dirty} className="btn-primary"><Save size={15} /> Save changes</button>
        </div>
      </div>
    </div>
  );
}
