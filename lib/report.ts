import type { Device, TelemetryRecord } from './types';

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
