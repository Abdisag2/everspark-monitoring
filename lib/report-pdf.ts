import type { ReportModel } from './report';
import { metricRows } from './report';
import type { ReportFrequency } from './types';

/**
 * Branded EverSpark report PDF, rendered with jsPDF so the SAME code runs in the
 * browser (manual download) and in the Node serverless cron (emailed attachment).
 * jsPDF is imported dynamically so it loads cleanly in both environments.
 *
 * Returns the raw PDF bytes: wrap in a Blob in the browser, or Buffer.from(...) in Node.
 */

// Ever Spark palette (from tailwind.config.js)
const TEAL: [number, number, number] = [13, 142, 135];   // brand-600 #0d8e87
const TEAL_DK: [number, number, number] = [16, 114, 109]; // brand-700 #10726d
const INK: [number, number, number] = [15, 23, 42];       // slate-900
const SLATE: [number, number, number] = [71, 85, 105];    // slate-600
const MUTE: [number, number, number] = [148, 163, 184];   // slate-400
const TILE_BG: [number, number, number] = [239, 253, 251]; // brand-50 #effdfb
const BORDER: [number, number, number] = [203, 213, 225];  // slate-300

const PDF_TITLES: Record<string, string> = {
  monthly: 'MONTHLY REPORT', custom: 'SYSTEM REPORT',
  daily: 'DAILY REPORT', weekly: 'WEEKLY REPORT', quarterly: 'QUARTERLY REPORT',
  semiannual: 'SEMI-ANNUAL REPORT', yearly: 'ANNUAL REPORT',
};

export async function renderReportPdf(
  model: ReportModel,
  kind: 'monthly' | 'custom' | ReportFrequency = 'monthly',
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // ~595
  const H = doc.internal.pageSize.getHeight();  // ~842
  const M = 42;                                 // page margin

  // ---- Header band ----
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 96, 'F');
  doc.setFillColor(...TEAL_DK);
  doc.rect(0, 96, W, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('EVER SPARK', M, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(209, 250, 246);
  doc.text('Monitoring', M, 64);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  const title = PDF_TITLES[kind] ?? 'SYSTEM REPORT';
  doc.text(title, W - M, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(209, 250, 246);
  doc.text(model.periodLabel, W - M, 62, { align: 'right' });

  // ---- Device identity block ----
  let y = 134;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(model.deviceName, M, y, { maxWidth: W - M * 2 });

  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  const meta = [
    model.orgName,
    model.location,
    model.systemId ? `ID ${model.systemId}` : undefined,
    model.simNumber ? `SIM ${model.simNumber}` : undefined,
  ].filter(Boolean).join('   ·   ');
  if (meta) { doc.text(meta, M, y); y += 16; }

  doc.setTextColor(...MUTE);
  doc.setFontSize(9);
  doc.text(
    `Reporting period: ${fmt(model.fromISO)} – ${fmt(new Date(new Date(model.toISO).getTime() - 1).toISOString())}`,
    M, y,
  );
  y += 24;

  // ---- KPI grid: 2 columns × 3 rows ----
  const rows = metricRows(model.metrics);
  const gap = 14;
  const colW = (W - M * 2 - gap) / 2;
  const tileH = 78;
  rows.forEach((r, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (colW + gap);
    const ty = y + row * (tileH + gap);
    doc.setFillColor(...TILE_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, ty, colW, tileH, 8, 8, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(r.label.toUpperCase(), x + 16, ty + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...TEAL_DK);
    doc.text(r.value, x + 16, ty + 54);

    if (r.unit) {
      const vw = doc.getTextWidth(r.value);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...MUTE);
      doc.text(r.unit, x + 16 + vw + 8, ty + 54);
    }
  });
  y += Math.ceil(rows.length / 2) * (tileH + gap) + 8;

  // ---- Data summary strip ----
  doc.setDrawColor(...BORDER);
  doc.line(M, y, W - M, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE);
  const summary = [
    `${model.frames.toLocaleString()} data frames`,
    model.firstISO ? `first ${fmt(model.firstISO)}` : null,
    model.lastISO ? `last ${fmt(model.lastISO)}` : null,
  ].filter(Boolean).join('    ·    ');
  doc.text(summary, M, y);
  y += 14;
  doc.setTextColor(...MUTE);
  doc.setFontSize(8.5);
  doc.text(
    'Water and disinfectant totals are time-weighted over the frames received; uptime compares frames received against the expected cadence. Full per-frame data accompanies this report as a CSV file.',
    M, y, { maxWidth: W - M * 2, lineHeightFactor: 1.4 },
  );

  // ---- Footer ----
  doc.setDrawColor(...BORDER);
  doc.line(M, H - 56, W - M, H - 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTE);
  doc.text('Ever Spark Monitoring  ·  EverSpark Technologies PLC', M, H - 38);
  doc.text(`Generated ${fmt(model.generatedISO)}`, W - M, H - 38, { align: 'right' });

  return new Uint8Array(doc.output('arraybuffer'));
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
