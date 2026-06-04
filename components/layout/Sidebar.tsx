'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NAV_BY_ROLE } from '@/lib/nav';
import { EverSparkLogo, EverSparkMark } from '@/components/brand/EverSparkLogo';
import { RolePill } from '@/components/shared/StatusBadge';
import { cn, initials } from '@/lib/utils';

export function Sidebar() {
  const { currentUser, panelState, setPanel, logout } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const sections = NAV_BY_ROLE[currentUser.role];

  const signOut = () => { logout(); router.replace('/login'); };

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-white border-r border-slate-200/80 transition-all duration-300 shrink-0',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Brand */}
      <div className={cn('flex items-center h-14 border-b border-slate-100 shrink-0', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? <EverSparkMark size={30} /> : <EverSparkLogo markSize={32} />}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {sections.map((section) => (
          <div key={section.heading}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{section.heading}</p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = panelState.view === item.view;
                const Icon = item.icon;
                return (
                  <button
                    key={item.view}
                    onClick={() => setPanel({ view: item.view } as any)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer',
                      collapsed && 'justify-center',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-ink'
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-brand-600" />}
                    <Icon size={18} className={cn('shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="border-t border-slate-100 p-3 shrink-0">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="grid place-items-center h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-xs font-bold shrink-0">
            {initials(currentUser.name)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">{currentUser.name}</p>
              <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={signOut} className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-rose-500" title="Sign out">
              <LogOut size={16} />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="mt-2.5 flex items-center justify-between">
            <RolePill role={currentUser.role} />
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-16 grid place-items-center h-6 w-6 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-brand-600 hover:border-brand-300 shadow-sm transition-colors cursor-pointer"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeft size={14} className={cn('transition-transform', collapsed && 'rotate-180')} />
      </button>
    </aside>
  );
}
