export type UserRole = 'admin' | 'manager' | 'viewer';
export type DeviceStatus = 'online' | 'offline';
export type AlarmType =
  | 'production_complete'
  | 'no_naclo'
  | 'threshold_breach'
  | 'device_offline'
  | 'device_reconnected';

// ---- Custom roles & permissions (S1-1) ----

export type Permission =
  | 'devices:read'
  | 'devices:write'
  | 'alarms:read'
  | 'alarms:acknowledge'
  | 'alarms:configure'
  | 'members:read'
  | 'members:invite'
  | 'members:manage'
  | 'org:read'
  | 'org:write'
  | 'reports:export'
  | 'dashboard:customize';

export interface Role {
  id: string;
  name: string;
  org_id: string | null;
  created_at: string;
}

export interface RolePermission {
  role_id: string;
  permission: Permission;
}

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
  system_id?: string;
  created_at: string;
  offline_threshold_minutes?: number;
}

// ---- Threshold alarm rules (S1-2) ----

export type AlarmCondition = 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
export type AlarmSeverity = 'info' | 'warning' | 'critical';

export interface AlarmRule {
  id: string;
  org_id: string;
  device_id: string | null;
  parameter: string;
  condition: AlarmCondition;
  threshold: number;
  severity: AlarmSeverity;
  label: string | null;
  is_active: boolean;
  created_by: string | null;
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
  level_sensor_3: 0 | 1;    // P5  1=NaClO depleted (alarm)
  naclo_pumped: number;     // P6  L
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
  // threshold_breach fields
  severity?: 'info' | 'warning' | 'critical';
  rule_id?: string;
  parameter?: string;
  value?: number;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization_id: string | null;
  custom_role_id?: string | null;
  permissions?: Permission[];
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
  | 'roles'
  | 'alarm-rules'
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
