import type { Organization, Profile, Device, TelemetryRecord, AlarmRecord } from './types';

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

export const MOCK_ORGANIZATIONS: Organization[] = [
  { id: 'org-001', name: 'Addis Ababa Water & Sewerage', created_at: iso(now - 420 * 86400e3) },
  { id: 'org-002', name: 'Oromia Rural Water Bureau',    created_at: iso(now - 260 * 86400e3) },
  { id: 'org-003', name: 'Dire Dawa Water Utility',      created_at: iso(now - 95 * 86400e3) },
];

export const MOCK_PROFILES: Profile[] = [
  { id: 'user-001', organization_id: null,      email: 'admin@eversparktech.com',   name: 'System Administrator', role: 'admin',   is_active: true, created_at: iso(now - 500 * 86400e3) },

  { id: 'user-002', organization_id: 'org-001', email: 'g.tadesse@aaws.gov.et',      name: 'Girma Tadesse',        role: 'manager', is_active: true, created_at: iso(now - 410 * 86400e3) },
  { id: 'user-003', organization_id: 'org-001', email: 'a.bekele@aaws.gov.et',       name: 'Almaz Bekele',         role: 'viewer',  is_active: true, created_at: iso(now - 405 * 86400e3) },
  { id: 'user-004', organization_id: 'org-001', email: 's.haile@aaws.gov.et',        name: 'Selam Haile',          role: 'viewer',  is_active: true, created_at: iso(now - 120 * 86400e3) },

  { id: 'user-005', organization_id: 'org-002', email: 'b.dinka@orwb.gov.et',        name: 'Boru Dinka',           role: 'manager', is_active: true, created_at: iso(now - 250 * 86400e3) },
  { id: 'user-006', organization_id: 'org-002', email: 'k.gemechu@orwb.gov.et',      name: 'Kuma Gemechu',         role: 'viewer',  is_active: false, created_at: iso(now - 60 * 86400e3) },

  { id: 'user-007', organization_id: 'org-003', email: 'r.ahmed@ddwu.gov.et',        name: 'Rahel Ahmed',          role: 'manager', is_active: true, created_at: iso(now - 90 * 86400e3) },
];

interface DeviceSeed { id: string; org: string; name: string; location: string; system_id: string; online: boolean; }

const DEVICE_SEEDS: DeviceSeed[] = [
  { id: 'dev-001', org: 'org-001', name: 'Clara-MWA "Korata" (CI-4824-01)',      location: 'Korata, Amhara',      system_id: 'm350349272', online: true },
  { id: 'dev-002', org: 'org-001', name: 'Clara-MWA "Wonchit" (CI-4824-02)',     location: 'Wonchit, Amhara',     system_id: 'm350314171', online: true },
  { id: 'dev-003', org: 'org-001', name: 'Clara-MWA "Ambomesk" (CI-4824-03)',    location: 'Ambomesk, Amhara',    system_id: 'm350314205', online: false },
  { id: 'dev-004', org: 'org-002', name: 'Clara-Heks "Locheber" (CI-1223-01)',   location: 'Omo River, Oromia',   system_id: 'm350450045', online: true },
  { id: 'dev-005', org: 'org-002', name: 'Clara-Heks "Borkonech" (CI-1223-02)',  location: 'Omo River, Oromia',   system_id: 'm350450030', online: true },
  { id: 'dev-006', org: 'org-003', name: 'Clara-DD "Sabian" (CI-7790-01)',       location: 'Sabian, Dire Dawa',   system_id: 'm350450101', online: false },
];

/** Deterministic 32-char hex token from a seed — distinct per device, hydration-safe. */
function seededToken(seed: string): string {
  let h = 2166136261 >>> 0; // FNV-1a
  let out = '';
  for (let n = 0; n < 32; n++) {
    h ^= seed.charCodeAt(n % seed.length) + n;
    h = Math.imul(h, 16777619) >>> 0;
    out += (h & 0xf).toString(16);
  }
  return `es_${out}`;
}

export const MOCK_DEVICES: Device[] = DEVICE_SEEDS.map((d) => ({
  id: d.id,
  organization_id: d.org,
  name: d.name,
  secret_token: seededToken(d.system_id + d.id),
  status: d.online ? 'online' : 'offline',
  last_seen: d.online ? iso(now - Math.floor(Math.random() * 9) * 60e3) : iso(now - (2 + Math.floor(Math.random() * 30)) * 3600e3),
  location: d.location,
  system_id: d.system_id,
  created_at: iso(now - 200 * 86400e3),
}));

/**
 * Generate a realistic 24h history at 15-min resolution for one device.
 * Models a chlorine production cycle: tank fills (flow), pump runs (NaClO),
 * level sensors toggle, pH/active-chlorine drift around targets.
 */
function genTelemetry(device: DeviceSeed, startId: number): TelemetryRecord[] {
  const out: TelemetryRecord[] = [];
  const points = device.online ? 96 : 70; // offline device has older/partial data
  const step = 15 * 60e3;
  const base = device.online ? now : now - 4 * 3600e3;
  let producing = true;
  let naCloAccum = 0;

  for (let i = points - 1; i >= 0; i--) {
    const t = base - i * step;
    const phase = (points - i) / points;
    // toggle production every ~3h
    if ((points - i) % 12 === 0) producing = !producing;

    const flow = producing ? 35 + Math.sin(phase * Math.PI * 4) * 12 + Math.random() * 6 : Math.random() * 3;
    const naclo = producing ? 0.6 + Math.random() * 0.4 : 0;
    naCloAccum += naclo;

    out.push({
      id: startId + (points - i),
      device_id: device.id,
      flow_rate: +flow.toFixed(1),
      voltage: +(12.2 + Math.sin(phase * Math.PI * 2) * 0.6 + Math.random() * 0.2).toFixed(1),
      level_sensor_1: producing ? 1 : 0,
      level_sensor_2: producing ? 0 : (Math.random() > 0.7 ? 1 : 0),
      level_sensor_3: !producing && Math.random() > 0.85 ? 1 : 0,
      naclo_pumped: +naclo.toFixed(1),
      target_frc: 1.0,
      active_chlorine: +(0.7 + Math.sin(phase * Math.PI * 6) * 0.25 + Math.random() * 0.1).toFixed(1),
      ph_value: +(7.0 + Math.sin(phase * Math.PI * 3) * 0.4 + Math.random() * 0.15).toFixed(1),
      timestamp: iso(t),
    });
  }
  return out;
}

export const MOCK_TELEMETRY: TelemetryRecord[] = DEVICE_SEEDS
  .flatMap((d, idx) => genTelemetry(d, idx * 1000))
  // newest first — matches how the context prepends live records
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

export const MOCK_ALARMS: AlarmRecord[] = [
  {
    id: 'alarm-seed-1',
    device_id: 'dev-004',
    alarm_type: 'no_naclo',
    severity: 'critical',
    message: 'There is no Chlorine in the Clara system. Please immediately start a new production.',
    timestamp: iso(now - 40 * 60e3),
    acknowledged: false,
  },
  {
    id: 'alarm-seed-2',
    device_id: 'dev-001',
    alarm_type: 'production_complete',
    severity: 'warning',
    message: 'Chlorine production is completed. Please start a new production.',
    timestamp: iso(now - 3 * 3600e3),
    acknowledged: true,
  },
  {
    id: 'alarm-seed-3',
    device_id: 'dev-003',
    alarm_type: 'device_offline',
    severity: 'warning',
    message: 'Device "Clara-MWA Ambomesk" has gone offline (no data received).',
    timestamp: iso(now - 4.5 * 3600e3),
    acknowledged: false,
  },
];
