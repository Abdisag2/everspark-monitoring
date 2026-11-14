'use client';

import { useMemo, useState } from 'react';
import { Bell, Mail, Cpu, FileText, FileSpreadsheet, FileDown, CalendarClock } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { TimeRangePicker } from '@/components/shared/TimeRangePicker';
import { rangeStartMs } from '@/lib/timeRanges';
import { windowLabel } from '@/lib/report';
import { downloadReportCsv, downloadReportPdf } from '@/lib/report-download';

export function NotificationSettings() {
  const {
    currentUser, getVisibleDevices, organizations, exportDeviceTelemetry,
    myAlarmEmailEnabled, setMyAlarmEmail,
    myAlarmEmailAllDevices, setMyAlarmEmailAllDevices,
    myEmailDeviceIds, setMyEmailDevices,
    myReportDeviceIds, setMyReportDevices,
  } = useApp();

  const devices = getVisibleDevices();
  const selected = new Set(myEmailDeviceIds);
  const reportSel = new Set(myReportDeviceIds);

  const toggleDevice = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setMyEmailDevices([...next]);
  };
  const toggleReportDevice = (id: string) => {
    const next = new Set(reportSel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setMyReportDevices([...next]);
  };

  // --- Manual report generator ---
  const [genDevice, setGenDevice] = useState<string>(devices[0]?.id ?? '');
  const [genRange, setGenRange] = useState<string>('month');
  const [busy, setBusy] = useState<'' | 'csv' | 'pdf'>('');

  const device = useMemo(() => devices.find((d) => d.id === genDevice), [devices, genDevice]);

  const generate = async (format: 'csv' | 'pdf') => {
    if (!device || busy) return;
    setBusy(format);
    try {
      const fromMs = rangeStartMs(genRange);
      const toMs = Date.now();
      const rows = await exportDeviceTelemetry(device.id, fromMs);
      const periodLabel = windowLabel(fromMs, toMs);
      if (format === 'csv') {
        downloadReportCsv(rows, device, periodLabel);
      } else {
        const orgName = organizations.find((o) => o.id === device.organization_id)?.name;
        await downloadReportPdf(rows, { device, orgName, fromMs, toMs, periodLabel, kind: 'custom' });
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 ring-4 ring-brand-50/60">
          <Bell size={22} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">Notifications &amp; reports</h2>
          <p className="text-sm text-slate-500">Alarm emails, monthly reports, and on-demand downloads</p>
        </div>
      </div>

      {/* ============ Alarm emails ============ */}
      <div className="card p-5 space-y-5">
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
                {selected.size === 0 && (
                  <p className="text-xs text-amber-600">Select at least one device, or you won&apos;t receive any alarm emails.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ Monthly reports ============ */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <CalendarClock size={18} className="text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-ink">Email me a monthly report</p>
            <p className="text-xs text-slate-400">
              A CSV of the month&apos;s data plus a PDF summary, sent to {currentUser.email} at the start of each month
            </p>
          </div>
        </div>

        <div className="pt-1 space-y-1.5">
          <p className="text-sm font-semibold text-slate-700">Which devices?</p>
          {devices.length === 0 && <p className="text-xs text-slate-400">No devices available.</p>}
          {devices.map((d) => (
            <label key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={reportSel.has(d.id)} onChange={() => toggleReportDevice(d.id)} className="h-4 w-4 accent-brand-600" />
              <Cpu size={15} className="text-slate-400" />
              <span className="text-sm text-ink">{d.name}</span>
            </label>
          ))}
          {reportSel.size === 0 && (
            <p className="text-xs text-slate-400">No monthly reports selected. Tick a device to start receiving them.</p>
          )}
        </div>
      </div>

      {/* ============ Generate a report now ============ */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <FileText size={18} className="text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-ink">Generate a report now</p>
            <p className="text-xs text-slate-400">Pick a device and time range, then download the CSV data or the PDF summary</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Device</span>
            <select
              value={genDevice}
              onChange={(e) => setGenDevice(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
            >
              {devices.length === 0 && <option value="">No devices</option>}
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Time range</span>
            <div className="mt-1"><TimeRangePicker value={genRange} onChange={setGenRange} /></div>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => generate('csv')}
            disabled={!device || !!busy}
            className="btn-outline py-2 disabled:opacity-50"
          >
            <FileSpreadsheet size={15} /> {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
          </button>
          <button
            onClick={() => generate('pdf')}
            disabled={!device || !!busy}
            className="btn-primary py-2 disabled:opacity-50"
          >
            <FileDown size={15} /> {busy === 'pdf' ? 'Building PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
