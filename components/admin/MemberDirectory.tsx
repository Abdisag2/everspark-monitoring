'use client';

import { useMemo, useState } from 'react';
import { Users, UserPlus, Pencil, Trash2, Search, Ban, CheckCircle2, ShieldAlert, MailCheck, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Modal } from '@/components/shared/Modal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { RolePill } from '@/components/shared/StatusBadge';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { cn, initials } from '@/lib/utils';
import type { Profile, UserRole } from '@/lib/types';

interface FormState { name: string; email: string; organization_id: string; role: UserRole; }

export function MemberDirectory({
  scopeOrgId, allowAdminRole = true, title = 'Members', subtitle,
}: {
  scopeOrgId?: string;
  allowAdminRole?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const { profiles, organizations, addProfile, updateProfile, deleteProfile } = useApp();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', email: '', organization_id: '', role: 'viewer' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');

  const roleOptions: UserRole[] = allowAdminRole ? ['admin', 'manager', 'viewer'] : ['manager', 'viewer'];
  const orgOptions = scopeOrgId ? organizations.filter((o) => o.id === scopeOrgId) : organizations;
  const orgName = (id: string | null) => (id ? organizations.find((o) => o.id === id)?.name ?? '—' : 'Platform (global)');

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return profiles
      .filter((p) => (scopeOrgId ? p.organization_id === scopeOrgId : true))
      .filter((p) => roleFilter === 'all' || p.role === roleFilter)
      .filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [profiles, query, roleFilter, scopeOrgId]);

  const openCreate = () => { setForm({ name: '', email: '', organization_id: scopeOrgId ?? orgOptions[0]?.id ?? '', role: 'viewer' }); setFormError(''); setCreating(true); };
  const openEdit = (p: Profile) => { setForm({ name: p.name, email: p.email, organization_id: p.organization_id ?? '', role: p.role }); setFormError(''); setEditing(p); };
  const closeModal = () => { setCreating(false); setEditing(null); setFormError(''); };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim() || busy) return;
    // Guard: managers may never create/elevate to admin
    const role = !allowAdminRole && form.role === 'admin' ? 'manager' : form.role;
    const org = role === 'admin' ? null : (form.organization_id || null);

    // Editing an existing member (local update).
    if (editing) {
      updateProfile(editing.id, { name: form.name.trim(), email: form.email.trim(), role, organization_id: org });
      closeModal();
      return;
    }

    // New member: send a real email invitation when Supabase is connected.
    if (isSupabaseConfigured) {
      setBusy(true); setFormError('');
      try {
        const { data: { session } } = await getSupabase()!.auth.getSession();
        const res = await fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({ email: form.email.trim(), name: form.name.trim(), role, organization_id: org }),
        });
        const json = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) { setFormError(json.error ?? 'Failed to send invitation'); return; }
        closeModal();
        setToast(`Invitation email sent to ${form.email.trim()}.`);
        setTimeout(() => setToast(''), 6000);
      } catch (err: any) {
        setBusy(false);
        setFormError(err?.message ?? 'Network error — please try again.');
      }
      return;
    }

    // Demo mode: add to the local directory.
    addProfile({ name: form.name.trim(), email: form.email.trim(), role, organization_id: org, is_active: true });
    closeModal();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {toast && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 animate-scale-in">
          <MailCheck size={16} className="shrink-0" /> {toast}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle ?? `${rows.length} account${rows.length !== 1 ? 's' : ''}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {(['all', ...roleOptions] as const).map((r) => (
              <button key={r} onClick={() => setRoleFilter(r)} className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer', roleFilter === r ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink')}>{r}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members…" className="input pl-9 py-2 w-full sm:w-56" />
          </div>
          <button onClick={openCreate} className="btn-primary whitespace-nowrap"><UserPlus size={16} /> Invite</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="text-left font-semibold px-5 py-3">Member</th>
                {!scopeOrgId && <th className="text-left font-semibold px-3 py-3">Organization</th>}
                <th className="text-left font-semibold px-3 py-3">Role</th>
                <th className="text-left font-semibold px-3 py-3">Status</th>
                <th className="text-right font-semibold px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((p) => (
                <tr key={p.id} className={cn('hover:bg-slate-50/70 transition-colors', !p.is_active && 'opacity-60')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid place-items-center h-9 w-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-white text-xs font-bold shrink-0">{initials(p.name)}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 truncate">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  {!scopeOrgId && <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate" title={orgName(p.organization_id)}>{orgName(p.organization_id)}</td>}
                  <td className="px-3 py-3"><RolePill role={p.role} /></td>
                  <td className="px-3 py-3">
                    {p.is_active
                      ? <span className="chip bg-emerald-50 text-emerald-700"><CheckCircle2 size={12} /> Active</span>
                      : <span className="chip bg-amber-50 text-amber-700"><Ban size={12} /> Suspended</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button onClick={() => updateProfile(p.id, { is_active: !p.is_active })} className={cn('btn-ghost p-1.5 rounded-lg', p.is_active ? 'hover:text-amber-500' : 'hover:text-emerald-500')} title={p.is_active ? 'Suspend' : 'Reactivate'}>
                        {p.is_active ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                      </button>
                      <button onClick={() => openEdit(p)} className="btn-ghost p-1.5 rounded-lg" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => setDeleting(p)} className="btn-ghost p-1.5 rounded-lg hover:text-rose-500" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                  <Users size={26} className="mx-auto text-slate-300 mb-2" /> No members found.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit member modal */}
      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? 'Edit Member' : 'Invite Member'}
        description={editing
          ? 'Update this account’s details and access.'
          : isSupabaseConfigured ? 'We’ll email them an invitation link to set their password.' : 'Add a new account and assign their role.'}
        size="lg"
        footer={
          <>
            <button onClick={closeModal} className="btn-outline">Cancel</button>
            <button onClick={save} disabled={!form.name.trim() || !form.email.trim() || busy} className="btn-primary">
              {busy ? 'Sending…' : editing ? 'Save changes' : isSupabaseConfigured ? 'Send invitation' : 'Add member'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Full name</span>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Almaz Bekele" className="input mt-1.5" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="a.bekele@org.gov.et" className="input mt-1.5" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="input mt-1.5 capitalize">
              {roleOptions.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Organization</span>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} disabled={!!scopeOrgId || form.role === 'admin'} className="input mt-1.5 disabled:bg-slate-50 disabled:text-slate-400">
              {form.role === 'admin'
                ? <option value="">Platform (global)</option>
                : <>
                    <option value="" disabled>Select organization…</option>
                    {orgOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </>}
            </select>
          </label>
        </div>
        {!allowAdminRole && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" /> Managers can assign <strong>manager</strong> or <strong>viewer</strong> roles only — promotion to admin is restricted.
          </p>
        )}
        {formError && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {formError}
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteProfile(deleting.id)}
        title="Remove member?"
        confirmLabel="Remove"
        message={<>This permanently removes <strong className="text-ink">{deleting?.name}</strong> ({deleting?.email}) from the platform. This cannot be undone.</>}
      />
    </div>
  );
}
