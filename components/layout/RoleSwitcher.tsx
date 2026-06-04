'use client';

import { Shield, Briefcase, Eye, Sparkles, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROLES: Array<{ id: UserRole; label: string; scope: string; icon: React.ElementType; active: string }> = [
  { id: 'admin',   label: 'Admin',   scope: 'Global',            icon: Shield,    active: 'bg-violet-600 text-white shadow-sm shadow-violet-600/30' },
  { id: 'manager', label: 'Manager', scope: 'Addis Ababa W&S',   icon: Briefcase, active: 'bg-accent-600 text-white shadow-sm shadow-accent-600/30' },
  { id: 'viewer',  label: 'Viewer',  scope: 'Addis Ababa W&S',   icon: Eye,       active: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30' },
];

export function RoleSwitcher() {
  const { authUser, currentUser, isPreviewing, switchRole, getUnackedAlarms } = useApp();
  const unacked = getUnackedAlarms();

  // Only the signed-in admin gets the role-preview (impersonation) bar.
  if (authUser?.role !== 'admin') return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-ink text-white/90 shrink-0 z-40">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={14} className="text-brand-300 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50 hidden sm:inline">{isPreviewing ? 'Previewing' : 'Preview as'}</span>
        <div className="flex items-center gap-1 ml-1 p-1 rounded-xl bg-white/5">
          {ROLES.map(({ id, label, scope, icon: Icon, active }) => {
            const on = currentUser.role === id;
            return (
              <button
                key={id}
                onClick={() => switchRole(id)}
                title={`View as ${label} (${scope})`}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer',
                  on ? active : 'text-white/60 hover:text-white hover:bg-white/10'
                )}
              >
                <Icon size={13} />
                <span>{label}</span>
                <span className={cn('hidden md:inline font-normal', on ? 'text-white/70' : 'text-white/35')}>· {scope}</span>
              </button>
            );
          })}
        </div>
      </div>

      {unacked.length > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 ring-1 ring-rose-400/30 shrink-0">
          <AlertTriangle size={12} className="text-rose-300" />
          <span className="text-[11px] font-semibold text-rose-200">
            {unacked.length} active alarm{unacked.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
