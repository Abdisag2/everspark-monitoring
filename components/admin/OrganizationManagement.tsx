'use client';

import { useMemo, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Search, Cpu, Users, Calendar } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Modal } from '@/components/shared/Modal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { StatusDot } from '@/components/shared/StatusBadge';
import type { Organization } from '@/lib/types';

export function OrganizationManagement() {
  const { organizations, devices, profiles, addOrg, updateOrg, deleteOrg, setPanel } = useApp();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Organization | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [name, setName] = useState('');

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return organizations
      .filter((o) => o.name.toLowerCase().includes(q))
      .map((o) => {
        const devs = devices.filter((d) => d.organization_id === o.id);
        return {
          org: o,
          devices: devs.length,
          online: devs.filter((d) => d.status === 'online').length,
          members: profiles.filter((p) => p.organization_id === o.id).length,
        };
      });
  }, [organizations, devices, profiles, query]);

  const openCreate = () => { setName(''); setCreating(true); };
  const openEdit = (o: Organization) => { setName(o.name); setEditing(o); };
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) updateOrg(editing.id, trimmed);
    else addOrg(trimmed);
    setEditing(null); setCreating(false); setName('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Organizations</h2>
          <p className="text-sm text-slate-500">{organizations.length} client enterprises on the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search organizations…" className="input pl-9 py-2 w-full sm:w-60" />
          </div>
          <button onClick={openCreate} className="btn-primary whitespace-nowrap"><Plus size={16} /> New Org</button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map(({ org, devices: dCount, online, members }) => (
          <div key={org.id} className="card p-5 group hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid place-items-center h-11 w-11 rounded-xl bg-accent-50 text-accent-600 ring-4 ring-accent-50/60 shrink-0">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate" title={org.name}>{org.name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar size={11} /> {new Date(org.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(org)} className="btn-ghost p-1.5 rounded-lg" title="Edit"><Pencil size={15} /></button>
                <button onClick={() => setDeleting(org)} className="btn-ghost p-1.5 rounded-lg hover:text-rose-500" title="Delete"><Trash2 size={15} /></button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setPanel({ view: 'devices' })} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 hover:bg-slate-100 transition-colors cursor-pointer text-left">
                <Cpu size={16} className="text-brand-600" />
                <div>
                  <p className="text-sm font-bold text-ink leading-none">{dCount}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><StatusDot online={online > 0} /> {online} online</p>
                </div>
              </button>
              <button onClick={() => setPanel({ view: 'members' })} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 hover:bg-slate-100 transition-colors cursor-pointer text-left">
                <Users size={16} className="text-violet-600" />
                <div>
                  <p className="text-sm font-bold text-ink leading-none">{members}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">members</p>
                </div>
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="col-span-full card p-12 grid place-items-center text-center">
            <Building2 size={28} className="text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No organizations match “{query}”.</p>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? 'Edit Organization' : 'New Organization'}
        description={editing ? 'Update the enterprise name.' : 'Register a new client enterprise on the platform.'}
        footer={
          <>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-outline">Cancel</button>
            <button onClick={save} disabled={!name.trim()} className="btn-primary">{editing ? 'Save changes' : 'Create organization'}</button>
          </>
        }
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Organization name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Addis Ababa Water & Sewerage" className="input mt-1.5" />
        </label>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteOrg(deleting.id)}
        title="Delete organization?"
        message={<>This permanently removes <strong className="text-ink">{deleting?.name}</strong> along with all of its devices and members. This cannot be undone.</>}
      />
    </div>
  );
}
