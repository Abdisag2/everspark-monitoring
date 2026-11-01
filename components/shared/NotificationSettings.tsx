'use client';

import { Bell, Mail, Cpu } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

export function NotificationSettings() {
  const {
    currentUser, getVisibleDevices,
    myAlarmEmailEnabled, setMyAlarmEmail,
    myAlarmEmailAllDevices, setMyAlarmEmailAllDevices,
    myEmailDeviceIds, setMyEmailDevices,
  } = useApp();

  const devices = getVisibleDevices();
  const selected = new Set(myEmailDeviceIds);

  const toggleDevice = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setMyEmailDevices([...next]);
  };

  return (
    <div className="max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 ring-4 ring-brand-50/60">
          <Bell size={22} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">Notifications</h2>
          <p className="text-sm text-slate-500">Choose how you&apos;re alerted when a device raises an alarm</p>
        </div>
      </div>

      <div className="card p-5 space-y-5">
        {/* Master email toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Mail size={18} className="text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-ink">Email me device alarms</p>
              <p className="text-xs text-slate-400">Sent to {currentUser.email}</p>
            </div>
          </div>
          <button
            role="switch" aria-checked={myAlarmEmailEnabled}
            onClick={() => setMyAlarmEmail(!myAlarmEmailEnabled)}
            className={cn('relative h-6 w-11 rounded-full transition-colors cursor-pointer shrink-0', myAlarmEmailEnabled ? 'bg-brand-600' : 'bg-slate-300')}
          >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', myAlarmEmailEnabled ? 'left-[22px]' : 'left-0.5')} />
          </button>
        </div>

        {/* Device scope — only when email is on */}
        {myAlarmEmailEnabled && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Which devices?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setMyAlarmEmailAllDevices(true)}
                className={cn('flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  myAlarmEmailAllDevices ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
              >
                All devices
              </button>
              <button
                onClick={() => setMyAlarmEmailAllDevices(false)}
                className={cn('flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  !myAlarmEmailAllDevices ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
              >
                Only selected
              </button>
            </div>

            {!myAlarmEmailAllDevices && (
              <div className="space-y-1.5">
                {devices.length === 0 && <p className="text-xs text-slate-400">No devices available.</p>}
                {devices.map((d) => (
                  <label key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleDevice(d.id)} className="h-4 w-4 accent-brand-600" />
                    <Cpu size={15} className="text-slate-400" />
                    <span className="text-sm text-ink">{d.name}</span>
                  </label>
                ))}
                {!myAlarmEmailAllDevices && selected.size === 0 && (
                  <p className="text-xs text-amber-600">Select at least one device, or you won&apos;t receive any alarm emails.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
