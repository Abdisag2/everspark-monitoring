'use client';

import type { Device, TelemetryRecord } from './types';
import { computeReport, reportToCsv, reportSlug } from './report';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type DeviceLite = Pick<Device, 'id' | 'name' | 'system_id' | 'location' | 'sim_number'>;

/** Build + download the per-frame CSV for a device window (browser). */
export function downloadReportCsv(rows: TelemetryRecord[], device: DeviceLite, periodLabel: string) {
  const csv = reportToCsv(rows);
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${reportSlug(device.system_id ?? device.id, periodLabel)}.csv`,
  );
}

/** Build + download the branded PDF report for a device window (browser). */
export async function downloadReportPdf(
  rows: TelemetryRecord[],
  opts: { device: DeviceLite; orgName?: string; fromMs: number; toMs: number; periodLabel: string; kind?: 'monthly' | 'custom' },
) {
  const model = computeReport(rows, opts);
  const { renderReportPdf } = await import('./report-pdf');
  const bytes = await renderReportPdf(model, opts.kind ?? 'custom');
  triggerDownload(
    new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    `${reportSlug(opts.device.system_id ?? opts.device.id, opts.periodLabel)}.pdf`,
  );
}
