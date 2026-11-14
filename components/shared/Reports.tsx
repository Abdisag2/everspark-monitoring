'use client';

import { useMemo, useState } from 'react';
import { FileBarChart2, Cpu, FileText, FileSpreadsheet, FileDown, CalendarClock } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { TimeRangePicker } from '@/components/shared/TimeRangePicker';
import { rangeStartMs } from '@/lib/timeRanges';
import { windowLabel } from '@/lib/report';
import { downloadReportCsv, downloadReportPdf } from '@/lib/report-download';

export function Reports() {
  const {
    currentUser, getVisibleDevices, organizations, exportDeviceTelemetry,
    myReportDeviceIds, setMyReportDevices,
  } = useApp();

  const devices = getVisibleDevices();
  const reportSel = new Set(myReportDeviceIds);

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
          <FileBarChart2 size={22} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">Reports</h2>
          <p className="text-sm text-slate-500">Monthly report emails and on-demand CSV / PDF downloads</p>
        </div>
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
