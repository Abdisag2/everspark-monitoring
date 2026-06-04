import { cn } from '@/lib/utils';

export function StatusDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      {online && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 pulse-dot" />}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', online ? 'bg-emerald-500' : 'bg-slate-300')} />
    </span>
  );
}

export function StatusBadge({ online }: { online: boolean }) {
  return (
    <span className={cn('chip', online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
      <StatusDot online={online} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

export function RolePill({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    manager: 'bg-accent-50 text-accent-700 ring-1 ring-accent-200',
    viewer: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  };
  return <span className={cn('chip capitalize', map[role] ?? 'bg-slate-100 text-slate-600')}>{role}</span>;
}
