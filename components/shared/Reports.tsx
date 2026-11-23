'use client';

import { useMemo, useState } from 'react';
import { FileBarChart2, Cpu, FileText, FileSpreadsheet, FileDown, CalendarClock } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { TimeRangePicker } from '@/components/shared/TimeRangePicker';
import { rangeStartMs } from '@/lib/timeRanges';
import { windowLabel, REPORT_FREQUENCIES } from '@/lib/report';
import { downloadReportCsv, downloadReportPdf } from '@/lib/report-download';
import type { ReportFrequency } from '@/lib/types';

export function Reports() {
  const {
    currentUser, getVisibleDevices, organizations, exportDeviceTelemetry,
    myReportSubs, setMyReportFrequency,
  } = useApp();

  const devices = getVisibleDevices();
  const subscribedCount = devices.filter((d) => myReportSubs[d.id]).length;

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
          <p className="text-sm text-slate-500">Scheduled report emails and on-demand CSV / PDF downloads</p>
        </div>
      </div>

      {/* ============ Scheduled reports ============ */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <CalendarClock size={18} className="text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-ink">Email me a report</p>
            <p className="text-xs text-slate-400">
              A CSV plus a PDF summary emailed to {currentUser.email}. Pick a cadence per device — daily, weekly, monthly, quarterly, semi-annually or yearly.
            </p>
          </div>
        </div>

        <div className="pt-1 space-y-1.5">
          <p className="text-sm font-semibold text-slate-700">Which devices, how often?</p>
          {devices.length === 0 && <p className="text-xs text-slate-400">No devices available.</p>}
          {devices.map((d) => {
            const freq = myReportSubs[d.id];
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <Cpu size={15} className="text-slate-400 shrink-0" />
                <span className="text-sm text-ink flex-1 min-w-0 truncate">{d.name}</span>
                <select
                  value={freq ?? 'off'}
                  onChange={(e) => setMyReportFrequency(d.id, e.target.value === 'off' ? null : (e.target.value as ReportFrequency))}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 ${freq ? 'border-brand-200 bg-brand-50 text-brand-700 font-medium' : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  <option value="off">Off</option>
                  {REPORT_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            );
          })}
          {subscribedCount === 0 && (
            <p className="text-xs text-slate-400">No scheduled reports yet. Pick a cadence for a device to start receiving them.</p>
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
