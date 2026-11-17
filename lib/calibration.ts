/**
 * Remote calibration — shared metadata, parsing, and a demo responder.
 *
 * The Clara main board answers `get` with one line per parameter:
 *   `4  report_interval = 60 s  [5 .. 3600]  Ecophi report period`
 * (index, name, value, unit, [min .. max], help). That answer is the source of
 * truth for the current values and ranges; MAIN_PARAMS below only supplies labels,
 * grouping, and which parameters the app will let you change in v1.
 *
 * v1 scope: read the whole config + set SAFE main-board params. report_baud and
 * remote_cal are locked (settable:false) because either one, set wrong over the
 * air, cuts the unit off from the remote link. Dosing/chlorine params are shown
 * read-only. The same rules are enforced in the DB by queue_device_command().
 */

export interface MainParamMeta {
  index: number;
  name: string;
  label: string;
  unit: string;
  settable: boolean;     // false = locked (shown read-only with a reason)
  lockReason?: string;
  // Demo-mode defaults / ranges (live mode overlays the parsed device values).
  demo: number;
  min: number;
  max: number;
  help: string;
}

export const MAIN_PARAMS: MainParamMeta[] = [
  { index: 0,  name: 'production_min',  label: 'Production time',   unit: 'min', settable: true,  demo: 180,    min: 10,  max: 1440, help: 'Electrolysis time per batch' },
  { index: 1,  name: 'settling_min',    label: 'Settling time',     unit: 'min', settable: true,  demo: 30,     min: 0,   max: 240,  help: 'Settling time after electrolysis' },
  { index: 2,  name: 'transfer_min',    label: 'Transfer time',     unit: 'min', settable: true,  demo: 5,      min: 1,   max: 60,   help: 'Valve open time to transfer a batch' },
  { index: 3,  name: 'polarity_cycles', label: 'Polarity cycles',   unit: '',    settable: true,  demo: 1,      min: 0,   max: 100,  help: 'Reverse electrodes every N batches' },
  { index: 4,  name: 'report_interval', label: 'Report interval',   unit: 's',   settable: true,  demo: 60,     min: 5,   max: 3600, help: 'How often Clara sends a telemetry frame' },
  { index: 5,  name: 'level_debounce',  label: 'Level debounce',    unit: 's',   settable: true,  demo: 5,      min: 0,   max: 60,   help: 'Level-sensor filter time' },
  { index: 6,  name: 'voltage_ref',     label: 'Voltage reference', unit: 'V',   settable: true,  demo: 5.0,    min: 4.5, max: 5.5,  help: 'ADC reference (measure the 5 V pin)' },
  { index: 7,  name: 'voltage_divider', label: 'Voltage divider',   unit: '',    settable: true,  demo: 11.0,   min: 1,   max: 50,   help: 'Voltage-sensor divider ratio' },
  { index: 8,  name: 'resume_batch',    label: 'Resume after power cut', unit: '', settable: true, demo: 1,     min: 0,   max: 1,    help: '1 = continue a batch after a power cut' },
  { index: 9,  name: 'report_baud',     label: 'Report baud',       unit: 'baud', settable: false, lockReason: 'Changing the serial speed remotely would cut off the remote link', demo: 115200, min: 9600, max: 115200, help: 'Serial baud to the remote unit' },
  { index: 10, name: 'checkpoint_min',  label: 'Checkpoint interval', unit: 'min', settable: true, demo: 30,    min: 10,  max: 120,  help: 'Production progress saved every N min (resume point)' },
  { index: 11, name: 'water_ph',        label: 'Site-visit pH',     unit: 'pH',  settable: true,  demo: 7.1,    min: 0,   max: 14,   help: 'pH measured by hand on the last site visit; sent in the report' },
  { index: 12, name: 'active_cl',       label: 'Site-visit active chlorine', unit: 'mg/L', settable: true, demo: 0.5, min: 0, max: 10, help: 'Active chlorine measured by hand on the last site visit; sent in the report' },
  { index: 13, name: 'remote_cal',      label: 'Remote commands',   unit: '',    settable: false, lockReason: 'Disabling this remotely would lock out the remote link permanently', demo: 1, min: 0, max: 1, help: '1 = accept commands from the remote unit over RS485' },
  { index: 14, name: 'usb_window_min',  label: 'USB window',        unit: 'min', settable: true,  demo: 2,      min: 0,   max: 60,   help: 'USB console has the serial input this long after a reset' },
  { index: 15, name: 'usb_idle_min',    label: 'USB idle timeout',  unit: 'min', settable: true,  demo: 10,     min: 1,   max: 240,  help: 'Back to RS485 after this long without USB input' },
];

/**
 * Dosing-board params (chlorine target + pump/flow calibration), from the Clara
 * firmware table. Admin-editable over the remote link via `dosing set`; the dosing
 * board validates each value's range and rejects an out-of-range set. The live
 * `dosing get` dump is the source of truth for current values/ranges; this supplies
 * labels and the demo defaults.
 */
export interface DosingParamMeta { name: string; label: string; unit: string; demo: number; min: number; max: number; help: string; }
export const DOSING_PARAMS: DosingParamMeta[] = [
  { name: 'target_frc',       label: 'Target chlorine (FRC)', unit: 'mg/L',       demo: 1.5,    min: 0.1,  max: 10,    help: 'Chlorine to add to the water' },
  { name: 'naclo_strength',   label: 'NaClO strength',        unit: 'g/L',        demo: 4.5,    min: 0.5,  max: 60,    help: 'Strength of the produced NaClO' },
  { name: 'dose_interval',    label: 'Dosing interval',       unit: 's',          demo: 20,     min: 5,    max: 300,   help: 'Dosing control period' },
  { name: 'steps_per_rev',    label: 'Pump steps / rev',      unit: 'steps',      demo: 6400,   min: 200,  max: 51200, help: 'Driver microsteps per revolution' },
  { name: 'ml_per_rev',       label: 'Pump mL / rev',         unit: 'mL',         demo: 1.2,    min: 0.01, max: 50,    help: 'Pump output per rev (set via pumpcal on site)' },
  { name: 'flow_k',           label: 'Flowmeter K-factor',    unit: 'Hz/(L/min)', demo: 0.5,    min: 0.01, max: 100,   help: 'Flowmeter Hz per L/min (set via flowcal on site)' },
  { name: 'flow_corr_min',    label: 'Flow-correction threshold', unit: 'L/min',  demo: 5,      min: 0,    max: 2000,  help: 'Apply correction above this flow' },
  { name: 'flow_corr_gain',   label: 'Flow-correction gain',  unit: '',           demo: 1.02,   min: 0.1,  max: 10,    help: 'Q = gain · Qraw + offset' },
  { name: 'flow_corr_offset', label: 'Flow-correction offset', unit: 'L/min',     demo: 8.61,   min: -100, max: 100,   help: 'Q = gain · Qraw + offset' },
  { name: 'coef_low',         label: 'Dose coefficient (low flow)',  unit: '',    demo: 1.45,   min: 0,    max: 5,     help: 'Dose multiplier when flow ≤ band' },
  { name: 'coef_high',        label: 'Dose coefficient (high flow)', unit: '',    demo: 1.35,   min: 0,    max: 5,     help: 'Dose multiplier when flow > band' },
  { name: 'coef_band',        label: 'Flow band',             unit: 'L/min',      demo: 60,     min: 0,    max: 5000,  help: 'Flow separating the two multipliers' },
  { name: 'max_step_rate',    label: 'Max pump rate',         unit: 'steps/s',    demo: 10000,  min: 100,  max: 15000, help: 'Pump speed limit' },
  { name: 'test_step_rate',   label: 'Test pump rate',        unit: 'steps/s',    demo: 3200,   min: 100,  max: 15000, help: 'Pump speed for dose / pumpcal' },
  { name: 'flow_meter',       label: 'Flow meter size',       unit: 'inch',       demo: 3,      min: 0,    max: 3,     help: '2 = 2in DN50, 3 = 3in DN80, 0 = other' },
];

export interface ParsedParam { name: string; value: number; unit: string; min?: number; max?: number; help?: string; }

/**
 * Parse a Clara `get` dump into a name→value map. Tolerant of missing unit/range.
 * Line shape: `<#>  <name> = <value> <unit>  [<min> .. <max>]  <help>`
 */
export function parseParamDump(text: string): Record<string, ParsedParam> {
  const out: Record<string, ParsedParam> = {};
  if (!text) return out;
  const line = /^\s*(?:\d+\s+)?([a-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*([^\s[]*)\s*(?:\[\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\s*\])?\s*(.*)$/i;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(line);
    if (!m) continue;
    out[m[1].toLowerCase()] = {
      name: m[1].toLowerCase(),
      value: Number(m[2]),
      unit: m[3] || '',
      min: m[4] != null ? Number(m[4]) : undefined,
      max: m[5] != null ? Number(m[5]) : undefined,
      help: (m[6] || '').trim() || undefined,
    };
  }
  return out;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const dumpLine = (p: MainParamMeta | DosingParamMeta, v: number, i?: number) =>
  `${i != null ? i + '  ' : ''}${p.name} = ${fmt(v)}${p.unit ? ' ' + p.unit : ''}  [${fmt(p.min)} .. ${fmt(p.max)}]  ${p.help}`;

// --- Demo-mode device simulation (module-level, persists for the session) ---
const demoStore: Record<string, Record<string, number>> = {};
function demoValues(deviceId: string): Record<string, number> {
  if (!demoStore[deviceId]) {
    const seed: Record<string, number> = {};
    for (const p of MAIN_PARAMS) seed[p.name] = p.demo;
    for (const p of DOSING_PARAMS) seed[p.name] = p.demo;
    demoStore[deviceId] = seed;
  }
  return demoStore[deviceId];
}

/** Simulate Clara's answer to a command (demo mode only). */
export function demoDeviceAnswer(deviceId: string, cmd: string): { ok: boolean; response: string } {
  const vals = demoValues(deviceId);
  const line = cmd.trim();
  const low = line.toLowerCase();
  const tok = line.split(/\s+/);

  if (low === 'get') {
    return { ok: true, response: MAIN_PARAMS.map((p) => dumpLine(p, vals[p.name], p.index)).join('\n') };
  }
  if (low === 'dosing get') {
    return { ok: true, response: DOSING_PARAMS.map((p, i) => dumpLine(p, vals[p.name], i)).join('\n') };
  }
  if (tok[0].toLowerCase() === 'dosing' && (tok[1] || '').toLowerCase() === 'set' && tok[2] && tok[3] != null) {
    const p = DOSING_PARAMS.find((x) => x.name === tok[2].toLowerCase());
    if (!p) return { ok: false, response: `error - unknown parameter ${tok[2]}` };
    const v = Number(tok[3]);
    if (!Number.isFinite(v) || v < p.min || v > p.max) return { ok: false, response: `error - ${p.name} out of range [${fmt(p.min)} .. ${fmt(p.max)}]` };
    vals[p.name] = v;
    return { ok: true, response: `ok - dosing board saved: ${dumpLine(p, v)}` };
  }
  if (tok[0].toLowerCase() === 'get' && tok[1]) {
    const p = MAIN_PARAMS.find((x) => x.name === tok[1].toLowerCase());
    return p ? { ok: true, response: dumpLine(p, vals[p.name], p.index) } : { ok: false, response: `error - unknown parameter ${tok[1]}` };
  }
  if (low === 'status') {
    return { ok: true, response: `Clara v3.1  state=Standby  voltage=${fmt(vals['voltage_ref'] ?? 5)} V  dosing link OK  remote_cal=${vals['remote_cal']}` };
  }
  if (tok[0].toLowerCase() === 'set' && tok[1] && tok[2] != null) {
    const p = MAIN_PARAMS.find((x) => x.name === tok[1].toLowerCase());
    if (!p) return { ok: false, response: `error - unknown parameter ${tok[1]}` };
    if (!p.settable) return { ok: false, response: `error - ${p.name} is not settable remotely` };
    const v = Number(tok[2]);
    if (!Number.isFinite(v) || v < p.min || v > p.max) return { ok: false, response: `error - ${p.name} out of range [${fmt(p.min)} .. ${fmt(p.max)}]` };
    vals[p.name] = v;
    return { ok: true, response: `ok - ${dumpLine(p, v, p.index)}` };
  }
  return { ok: false, response: `error - command not allowed in v1` };
}
