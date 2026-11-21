import type { Device, TelemetryRecord, ReportFrequency } from './types';

/**
 * Shared monthly-report engine.
 *
 * One source of truth for the numbers and the CSV, used by BOTH:
 *   - the manual "generate a report" buttons on the Notifications page (browser), and
 *   - the scheduled monthly email job (app/api/monthly-reports, Node serverless).
 *
 * The water/NaClO math mirrors the device-detail stats exactly so a report never
 * disagrees with what the dashboard shows.
 */

export interface ReportMetrics {
  waterM3: number;      // total water disinfected in the period (m³)
  nacloL: number;       // volume of disinfectant (NaClO) produced in the period (L)
  uptimePct: number;    // frames received ÷ frames expected over the window (%)
  avgVoltage: number;   // average battery/system voltage (V)
  avgPh: number;        // average pH
  avgActiveCl: number;  // average active chlorine (mg/L)
}

export interface ReportModel {
  deviceName: string;
  deviceId: string;
  systemId?: string;
  orgName?: string;
  location?: string;
  simNumber?: string;
  periodLabel: string;   // e.g. "October 2026"
  fromISO: string;
  toISO: string;
  generatedISO: string;
  frames: number;
  firstISO?: string;
  lastISO?: string;
  metrics: ReportMetrics;
}

const ms = (iso: string) => new Date(iso).getTime();

/**
 * Compute the report figures for one device over [fromMs, toMs).
 * `rows` may be in any order; callers pass every frame they could fetch for the window.
 */
export function computeReport(
  rows: TelemetryRecord[],
  opts: {
    device: Pick<Device, 'id' | 'name' | 'system_id' | 'location' | 'sim_number'>;
    orgName?: string;
    fromMs: number;
    toMs: number;
    periodLabel: string;
  },
): ReportModel {
  const { device, orgName, fromMs, toMs, periodLabel } = opts;

  // Keep only frames inside the window, oldest → newest for time-weighted integration.
  const asc = rows
    .filter((t) => {
      const m = ms(t.timestamp);
      return m >= fromMs && m < toMs;
    })
    .sort((a, b) => ms(a.timestamp) - ms(b.timestamp));

  const frames = asc.length;

  // --- Water disinfected (m³) ---
  // flow_rate is L/min, so volume = ∫ flow dt. Trapezoidal over the real gap
  // between frames; offline gaps are capped at 3× the median interval so a dead
  // stretch doesn't invent flow. (Same method as the device-detail card.)
  let flowLitres = 0;
  let medInterval = 15 * 60_000; // default assumption: 15-min cadence
  if (asc.length > 1) {
    const deltas: number[] = [];
    for (let i = 1; i < asc.length; i++) deltas.push(ms(asc[i].timestamp) - ms(asc[i - 1].timestamp));
    medInterval = [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] || medInterval;
    const cap = Math.max(medInterval * 3, 60_000);
    for (let i = 1; i < asc.length; i++) {
      const dtMin = Math.min(deltas[i - 1], cap) / 60_000;
      const avgFlow = (asc[i - 1].flow_rate + asc[i].flow_rate) / 2; // L/min
      flowLitres += avgFlow * dtMin;
    }
  }

  // --- NaClO produced (L) --- naclo_pumped is mL dosed per frame → sum, mL → L.
  const nacloMl = asc.reduce((s, t) => s + (Number(t.naclo_pumped) || 0), 0);

  // --- Uptime (%) --- frames received vs frames expected for the whole window.
  const expected = Math.max(1, Math.round((toMs - fromMs) / medInterval));
  const uptimePct = frames < 2 ? 0 : Math.min(100, (frames / expected) * 100);

  // --- Averages ---
  const mean = (sel: (t: TelemetryRecord) => number) =>
    frames ? asc.reduce((s, t) => s + (Number(sel(t)) || 0), 0) / frames : 0;

  return {
    deviceName: device.name,
    deviceId: device.id,
    systemId: device.system_id,
    orgName,
    location: device.location,
    simNumber: device.sim_number,
    periodLabel,
    fromISO: new Date(fromMs).toISOString(),
    toISO: new Date(toMs).toISOString(),
    generatedISO: new Date().toISOString(),
    frames,
    firstISO: asc[0]?.timestamp,
    lastISO: asc[asc.length - 1]?.timestamp,
    metrics: {
      waterM3: flowLitres / 1000,
      nacloL: nacloMl / 1000,
      uptimePct,
      avgVoltage: mean((t) => t.voltage),
      avgPh: mean((t) => t.ph_value),
      avgActiveCl: mean((t) => t.active_chlorine),
    },
  };
}

/** Per-frame CSV for the window — same columns as the device-detail export. */
export function reportToCsv(rows: TelemetryRecord[]): string {
  const header = [
    'timestamp', 'flow_rate_lpm', 'voltage_v', 'level_1', 'level_2', 'level_3',
    'naclo_pumped_ml', 'target_frc', 'active_chlorine', 'ph',
  ];
  const asc = [...rows].sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
  const lines = asc.map((t) => [
    t.timestamp, t.flow_rate, t.voltage, t.level_sensor_1, t.level_sensor_2, t.level_sensor_3,
    t.naclo_pumped, t.target_frc, t.active_chlorine, t.ph_value,
  ].join(','));
  return [header.join(','), ...lines].join('\n');
}

/** The six headline figures as label/value/unit rows — drives the PDF KPI grid. */
export function metricRows(m: ReportMetrics): { label: string; value: string; unit: string }[] {
  return [
    { label: 'Water disinfected',      value: m.waterM3.toFixed(2),     unit: 'm³' },
    { label: 'Disinfectant produced',  value: m.nacloL.toFixed(2),      unit: 'L (NaClO)' },
    { label: 'Average uptime',         value: m.uptimePct.toFixed(1),   unit: '%' },
    { label: 'Avg. battery voltage',   value: m.avgVoltage.toFixed(2),  unit: 'V' },
    { label: 'Average pH',             value: m.avgPh.toFixed(2),       unit: '' },
    { label: 'Avg. active chlorine',   value: m.avgActiveCl.toFixed(2), unit: 'mg/L' },
  ];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** The UTC window for one calendar month (monthIndex0 may be out of range; Date.UTC wraps). */
export function monthWindow(year: number, monthIndex0: number): { fromMs: number; toMs: number; label: string } {
  const fromMs = Date.UTC(year, monthIndex0, 1);
  const toMs = Date.UTC(year, monthIndex0 + 1, 1);
  const d = new Date(fromMs);
  return { fromMs, toMs, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
}

/**
 * The previous calendar month in UTC, for the scheduled run on the 1st.
 * Returns the window and a label like "October 2026".
 */
export function previousMonthWindow(ref: Date = new Date()): { fromMs: number; toMs: number; label: string } {
  return monthWindow(ref.getUTCFullYear(), ref.getUTCMonth() - 1);
}

/** A friendly label for an arbitrary [from,to) window (manual reports). */
export function windowLabel(fromMs: number, toMs: number): string {
  const f = new Date(fromMs), t = new Date(toMs - 1);
  const sameMonth = f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
  if (f.getDate() === 1 && sameMonth && new Date(toMs).getDate() === 1) {
    return `${MONTHS[f.getMonth()]} ${f.getFullYear()}`;
  }
  const d = (x: Date) => `${x.getDate()} ${MONTHS[x.getMonth()].slice(0, 3)} ${x.getFullYear()}`;
  return `${d(f)} – ${d(t)}`;
}

/** Safe filename stem for a device + period. */
export function reportSlug(systemIdOrId: string, periodLabel: string): string {
  return `${systemIdOrId}_${periodLabel}`.replace(/[^\w.-]+/g, '_');
}

// ============================================================================
// Scheduled-report cadence
// ============================================================================

/** Options for the "Email me a report" cadence selector (order = UI order). */
export const REPORT_FREQUENCIES: { value: ReportFrequency; label: string }[] = [
  { value: 'daily',      label: 'Daily' },
  { value: 'weekly',     label: 'Weekly' },
  { value: 'monthly',    label: 'Monthly' },
  { value: 'quarterly',  label: 'Quarterly' },
  { value: 'semiannual', label: 'Semi-annually' },
  { value: 'yearly',     label: 'Yearly' },
];

/** Title-case noun for emails / PDF titles, e.g. "Quarterly". */
export const FREQ_NOUN: Record<ReportFrequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semiannual: 'Semi-annual', yearly: 'Annual',
};

const DAY_MS = 86_400_000;
const sh = (m: number) => MONTHS[m].slice(0, 3);

/** A cadence-aware label for a [from,to) window, e.g. "Q3 2026", "H1 2026", "2026". */
export function periodLabelFor(freq: ReportFrequency, fromMs: number, toMs: number): string {
  const f = new Date(fromMs);
  const y = f.getUTCFullYear(), mo = f.getUTCMonth(), d = f.getUTCDate();
  switch (freq) {
    case 'daily':      return `${d} ${sh(mo)} ${y}`;
    case 'weekly': {
      const t = new Date(toMs - DAY_MS);
      return `week of ${d} ${sh(mo)} – ${t.getUTCDate()} ${sh(t.getUTCMonth())} ${t.getUTCFullYear()}`;
    }
    case 'monthly':    return `${MONTHS[mo]} ${y}`;
    case 'quarterly':  return `Q${Math.floor(mo / 3) + 1} ${y}`;
    case 'semiannual': return `${mo === 0 ? 'H1' : 'H2'} ${y}`;
    case 'yearly':     return `${y}`;
  }
}

/**
 * The reporting window for a cadence IF a run on `ref` (UTC) should send it, else
 * null. Reports go out on calendar boundaries: daily every day (prior day), weekly
 * on Mondays (prior 7 days), monthly/quarterly/semiannual/yearly on the 1st of the
 * period that just closed. `periodStart` (YYYY-MM-DD) is the idempotency key.
 */
export function dueWindow(
  freq: ReportFrequency, ref: Date = new Date(),
): { fromMs: number; toMs: number; label: string; periodStart: string } | null {
  const y = ref.getUTCFullYear(), mo = ref.getUTCMonth(), day = ref.getUTCDate();
  const startOfToday = Date.UTC(y, mo, day);
  const mk = (fromMs: number, toMs: number) => ({
    fromMs, toMs, label: periodLabelFor(freq, fromMs, toMs),
    periodStart: new Date(fromMs).toISOString().slice(0, 10),
  });

  switch (freq) {
    case 'daily':
      return mk(startOfToday - DAY_MS, startOfToday);
    case 'weekly':
      if (ref.getUTCDay() !== 1) return null;              // Mondays
      return mk(startOfToday - 7 * DAY_MS, startOfToday);
    case 'monthly':
      if (day !== 1) return null;
      return mk(Date.UTC(y, mo - 1, 1), Date.UTC(y, mo, 1));
    case 'quarterly':
      if (day !== 1 || mo % 3 !== 0) return null;          // 1 Jan/Apr/Jul/Oct
      return mk(Date.UTC(y, mo - 3, 1), Date.UTC(y, mo, 1));
    case 'semiannual':
      if (day !== 1 || mo % 6 !== 0) return null;          // 1 Jan/Jul
      return mk(Date.UTC(y, mo - 6, 1), Date.UTC(y, mo, 1));
    case 'yearly':
      if (day !== 1 || mo !== 0) return null;              // 1 Jan
      return mk(Date.UTC(y - 1, 0, 1), Date.UTC(y, 0, 1));
  }
}
