export type UserRole = 'admin' | 'manager' | 'viewer';
export type DeviceStatus = 'online' | 'offline';
export type AlarmType = 'production_complete' | 'no_naclo';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string | null;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  organization_id: string;
  name: string;
  secret_token: string;
  status: DeviceStatus;
  last_seen: string | null;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  system_id?: string;
  created_at: string;
}

/**
 * Full Clara 9-parameter telemetry frame.
 * Wire format: ;P1,P2,P3,P4,P5,P6,P7,P8,P9:
 */
export interface TelemetryRecord {
  id: number;
  device_id: string;
  flow_rate: number;        // P1  L/min
  voltage: number;          // P2  V
  level_sensor_1: 0 | 1;    // P3  1=full/in-production, 0=empty/standby
  level_sensor_2: 0 | 1;    // P4
  level_sensor_3: 0 | 1;    // P5  1=NaClO available, 0=not available
  naclo_pumped: number;     // P6  mL dosed per frame
  target_frc: number;       // P7  mg/L
  active_chlorine: number;  // P8  mg/L
  ph_value: number;         // P9  unitless
  timestamp: string;
}

export interface AlarmRecord {
  id: string;
  device_id: string;
  alarm_type: AlarmType;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization_id: string | null;
}

/** A captured raw SIM800L POST as seen by the ingest simulator. */
export interface SimPacket {
  id: string;
  token: string;
  device_name: string;
  raw_payload: string;   // token=...&data=;...:
  data_string: string;   // ;...:
  timestamp: string;
  status: 'ok' | 'error';
  error?: string;
}

export type PanelView =
  | 'admin-dashboard'
  | 'organizations'
  | 'devices'
  | 'members'
  | 'simulation'
  | 'manager-dashboard'
  | 'org-settings'
  | 'team'
  | 'viewer-devices'
  | 'device-monitoring';

export type PanelState =
  | { view: Exclude<PanelView, 'device-monitoring'> }
  | { view: 'device-monitoring'; deviceId: string; backView?: PanelView };

export type TimeRange = '6h' | '24h' | '7d' | '30d';

export const PARAMETER_META = [
  { key: 'flow_rate',       label: 'Flow Rate',       unit: 'L/min', kind: 'analog' },
  { key: 'voltage',         label: 'System Voltage',  unit: 'V',     kind: 'analog' },
  { key: 'level_sensor_1',  label: 'Level Sensor 1',  unit: '',      kind: 'binary' },
  { key: 'level_sensor_2',  label: 'Level Sensor 2',  unit: '',      kind: 'binary' },
  { key: 'level_sensor_3',  label: 'Level Sensor 3',  unit: '',      kind: 'binary' },
  { key: 'naclo_pumped',    label: 'NaClO Pumped',    unit: 'L',     kind: 'analog' },
  { key: 'target_frc',      label: 'Target FRC',      unit: 'mg/L',  kind: 'analog' },
  { key: 'active_chlorine', label: 'Active Chlorine', unit: 'mg/L',  kind: 'analog' },
  { key: 'ph_value',        label: 'pH Value',        unit: '',      kind: 'analog' },
] as const;
