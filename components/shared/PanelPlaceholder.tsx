import { Hammer, type LucideIcon } from 'lucide-react';

export function PanelPlaceholder({ title, icon: Icon = Hammer, step }: { title: string; icon?: LucideIcon; step?: string }) {
  return (
    <div className="animate-fade-in">
      <div className="card p-12 grid place-items-center text-center">
        <span className="grid place-items-center h-14 w-14 rounded-2xl bg-brand-50 text-brand-600 ring-8 ring-brand-50/60">
          <Icon size={26} />
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          This panel is part of the build and will be wired up next.
          {step && <span className="block mt-1 text-xs font-medium text-brand-600">{step}</span>}
        </p>
      </div>
    </div>
  );
}
