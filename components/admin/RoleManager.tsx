'use client';

import { useState } from 'react';
import { ShieldCheck, Plus, Pencil, Trash2, Save, X, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import type { Role, Permission } from '@/lib/types';
import { cn } from '@/lib/utils';

export function RoleManager() {
  const { roles, rolePermissions, addRole, updateRole, deleteRole, setRolePermissions, currentUser } = useApp();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Set<Permission>>(new Set());
  const [permsDirty, setPermsDirty] = useState(false);

  const getPermsForRole = (roleId: string): Permission[] =>
    rolePermissions.filter((rp) => rp.role_id === roleId).map((rp) => rp.permission as Permission);

  function openRole(role: Role) {
    setSelectedRole(role);
    setPendingPerms(new Set(getPermsForRole(role.id)));
    setPermsDirty(false);
  }

  function togglePerm(key: Permission) {
    setPendingPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setPermsDirty(true);
  }

  function savePerms() {
    if (!selectedRole) return;
    setRolePermissions(selectedRole.id, Array.from(pendingPerms));
    setPermsDirty(false);
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const role = addRole(newName.trim(), currentUser.role === 'admin' ? null : currentUser.organization_id);
    setCreating(false);
    setNewName('');
    openRole(role);
  }

  function startEdit(role: Role) {
    setEditingId(role.id);
    setEditName(role.name);
  }

  function saveEdit(id: string) {
    if (editName.trim()) updateRole(id, editName.trim());
    setEditingId(null);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Roles &amp; Permissions</h2>
          <p className="text-sm text-slate-500">Create custom roles and assign fine-grained permissions</p>
        </div>
        <button
          onClick={() => { setCreating(true); setSelectedRole(null); }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} /> New Role
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role list */}
        <div className="lg:col-span-1 card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-ink">Custom Roles</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select a role to edit permissions</p>
          </div>

          {creating && (
            <div className="px-5 py-3 border-b border-slate-100 bg-brand-50/40 flex items-center gap-2">
              <ShieldCheck size={14} className="text-brand-500 shrink-0" />
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                placeholder="Role name…"
                className="input flex-1 py-1 text-sm"
              />
              <button onClick={handleCreate} className="text-brand-600 hover:text-brand-700"><Check size={15} /></button>
              <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>
          )}

          <div className="divide-y divide-slate-50">
            {roles.length === 0 && !creating && (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No custom roles yet.</p>
            )}
            {roles.map((role) => (
              <div
                key={role.id}
                className={cn(
                  'group flex items-center justify-between px-5 py-3 cursor-pointer transition-colors',
                  selectedRole?.id === role.id ? 'bg-brand-50' : 'hover:bg-slate-50',
                )}
                onClick={() => openRole(role)}
              >
                {editingId === role.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(role.id); if (e.key === 'Escape') setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="input flex-1 py-1 text-sm mr-2"
                  />
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck size={14} className={cn(selectedRole?.id === role.id ? 'text-brand-500' : 'text-slate-400')} />
                    <span className="text-sm font-medium text-ink truncate">{role.name}</span>
                    <span className="text-xs text-slate-400">
                      {getPermsForRole(role.id).length} perm{getPermsForRole(role.id).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {editingId === role.id ? (
                    <button onClick={(e) => { e.stopPropagation(); saveEdit(role.id); }} className="p-1 text-brand-600 hover:text-brand-700"><Check size={13} /></button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); startEdit(role); }} className="p-1 text-slate-400 hover:text-slate-600"><Pencil size={13} /></button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteRole(role.id); if (selectedRole?.id === role.id) setSelectedRole(null); }}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Permission editor */}
        <div className="lg:col-span-2 card overflow-hidden">
          {!selectedRole ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ShieldCheck size={32} className="text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">Select a role to manage its permissions</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink">{selectedRole.name}</h3>
                  <p className="text-xs text-slate-400">{pendingPerms.size} of {ALL_PERMISSIONS.length} permissions enabled</p>
                </div>
                {permsDirty && (
                  <button onClick={savePerms} className="btn-primary flex items-center gap-1.5 text-xs">
                    <Save size={13} /> Save
                  </button>
                )}
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALL_PERMISSIONS.map(({ key, label, description }) => (
                  <label
                    key={key}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                      pendingPerms.has(key)
                        ? 'border-brand-200 bg-brand-50/60'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={pendingPerms.has(key)}
                      onChange={() => togglePerm(key)}
                      className="mt-0.5 accent-brand-600 h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{label}</p>
                      <p className="text-xs text-slate-400">{description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Base role reference */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-ink">Built-in Role Defaults</h3>
          <p className="text-xs text-slate-400">These are fixed and cannot be edited. Custom roles are additive.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="text-left font-semibold px-5 py-2.5">Permission</th>
                <th className="text-center font-semibold px-4 py-2.5">Admin</th>
                <th className="text-center font-semibold px-4 py-2.5">Manager</th>
                <th className="text-center font-semibold px-4 py-2.5">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ALL_PERMISSIONS.map(({ key, label }) => {
                const adminHas = ['devices:read','devices:write','alarms:read','alarms:acknowledge','alarms:configure','members:read','members:invite','members:manage','org:read','org:write','reports:export','dashboard:customize'].includes(key);
                const managerHas = ['devices:read','devices:write','alarms:read','alarms:acknowledge','alarms:configure','members:read','members:invite','org:read','org:write','reports:export','dashboard:customize'].includes(key);
                const viewerHas = ['devices:read','alarms:read','alarms:acknowledge','members:read','org:read','dashboard:customize'].includes(key);
                return (
                  <tr key={key} className="hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 text-slate-700 font-medium">{label}</td>
                    <td className="px-4 py-2.5 text-center">{adminHas ? <span className="text-emerald-500">✓</span> : <span className="text-slate-200">—</span>}</td>
                    <td className="px-4 py-2.5 text-center">{managerHas ? <span className="text-emerald-500">✓</span> : <span className="text-slate-200">—</span>}</td>
                    <td className="px-4 py-2.5 text-center">{viewerHas ? <span className="text-emerald-500">✓</span> : <span className="text-slate-200">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
