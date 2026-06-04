'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type {
  Organization, Profile, Device, TelemetryRecord, AlarmRecord,
  AppUser, UserRole, SimPacket, PanelState,
} from '@/lib/types';
import {
  MOCK_ORGANIZATIONS, MOCK_PROFILES, MOCK_DEVICES, MOCK_TELEMETRY, MOCK_ALARMS,
} from '@/lib/mock-data';
import { generateToken, parseDataString } from '@/lib/utils';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/** Shared password for every demo account when no Supabase project is wired up. */
export const DEMO_PASSWORD = 'everspark';
const SESSION_KEY = 'es_session';
const PW_KEY = 'es_passwords';   // demo-mode per-account password overrides

const profileToUser = (p: Profile): AppUser => ({
  id: p.id, email: p.email, name: p.name, role: p.role, organization_id: p.organization_id,
});

/** Coerce a Supabase telemetry_data row (numerics may arrive as strings) into our type. */
function normalizeTelemetry(r: any): TelemetryRecord {
  const bit = (v: any): 0 | 1 => (Number(v) >= 0.5 ? 1 : 0);
  return {
    id: Number(r.id),
    device_id: r.device_id,
    flow_rate: Number(r.flow_rate),
    voltage: Number(r.voltage),
    level_sensor_1: bit(r.level_sensor_1),
    level_sensor_2: bit(r.level_sensor_2),
    level_sensor_3: bit(r.level_sensor_3),
    naclo_pumped: Number(r.naclo_pumped),
    target_frc: Number(r.target_frc),
    active_chlorine: Number(r.active_chlorine),
    ph_value: Number(r.ph_value),
    timestamp: r.timestamp,
  };
}

/** Demo identities behind the "View as…" switcher. Manager/Viewer scope to org-001. */
export const DEMO_USERS: Record<UserRole, AppUser> = {
  admin:   { id: 'user-001', email: 'admin@eversparktech.com', role: 'admin',   organization_id: null,      name: 'System Administrator' },
  manager: { id: 'user-002', email: 'g.tadesse@aaws.gov.et',   role: 'manager', organization_id: 'org-001', name: 'Girma Tadesse' },
  viewer:  { id: 'user-003', email: 'a.bekele@aaws.gov.et',    role: 'viewer',  organization_id: 'org-001', name: 'Almaz Bekele' },
};

interface Ctx {
  authUser: AppUser | null;        // the actually signed-in account
  authReady: boolean;              // false until the persisted session is restored
  currentUser: AppUser;            // active viewing identity (admins can preview other roles)
  isPreviewing: boolean;           // true when an admin is previewing a non-self role
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  accountExists: (email: string) => boolean;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  resetPassword: (email: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  organizations: Organization[];
  profiles: Profile[];
  devices: Device[];
  telemetry: TelemetryRecord[];
  alarms: AlarmRecord[];
  simPackets: SimPacket[];
  panelState: PanelState;

  switchRole: (role: UserRole) => void;
  setPanel: (p: PanelState) => void;

  addOrg: (name: string) => void;
  updateOrg: (id: string, name: string) => void;
  deleteOrg: (id: string) => void;

  addProfile: (data: Omit<Profile, 'id' | 'created_at'>) => void;
  updateProfile: (id: string, u: Partial<Profile>) => void;
  deleteProfile: (id: string) => void;

  addDevice: (d: { name: string; organization_id: string; location?: string; system_id?: string }) => Device;
  updateDevice: (id: string, u: Partial<Device>) => void;
  deleteDevice: (id: string) => void;
  regenerateToken: (id: string) => string;

  ingestTelemetry: (token: string, dataStr: string) => { ok: boolean; device?: Device; record?: TelemetryRecord; error?: string };
  addSimPacket: (p: SimPacket) => void;
  acknowledgeAlarm: (id: string) => void;

  // RLS-style scoped selectors
  getOrgDevices: (orgId: string) => Device[];
  getDeviceTelemetry: (deviceId: string, limit?: number) => TelemetryRecord[];
  getLatestTelemetry: (deviceId: string) => TelemetryRecord | null;
  getDeviceAlarms: (deviceId: string) => AlarmRecord[];
  getVisibleDevices: () => Device[];
  getVisibleOrgs: () => Organization[];
  getVisibleProfiles: () => Profile[];
  getUnackedAlarms: () => AlarmRecord[];
}

const AppContext = createContext<Ctx | null>(null);

let _seq = 90000;
const seq = () => String(_seq++);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const pwOverrides = useRef<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<AppUser>(DEMO_USERS.admin);
  // Live mode (Supabase configured) starts empty and loads from the DB; demo mode seeds mock data.
  const [organizations, setOrgs] = useState<Organization[]>(isSupabaseConfigured ? [] : MOCK_ORGANIZATIONS);
  const [profiles, setProfiles] = useState<Profile[]>(isSupabaseConfigured ? [] : MOCK_PROFILES);
  const [devices, setDevices] = useState<Device[]>(isSupabaseConfigured ? [] : MOCK_DEVICES);
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>(isSupabaseConfigured ? [] : MOCK_TELEMETRY);
  const [alarms, setAlarms] = useState<AlarmRecord[]>(isSupabaseConfigured ? [] : MOCK_ALARMS);
  const [simPackets, setSimPackets] = useState<SimPacket[]>([]);
  const [panelState, setPanelState] = useState<PanelState>({ view: 'admin-dashboard' });

  // refs so stable callbacks read fresh state without re-binding
  const devRef = useRef(devices); devRef.current = devices;
  const telRef = useRef(telemetry); telRef.current = telemetry;
  const alarmRef = useRef(alarms); alarmRef.current = alarms;
  const orgRef = useRef(organizations); orgRef.current = organizations;
  const profRef = useRef(profiles); profRef.current = profiles;
  const userRef = useRef(currentUser); userRef.current = currentUser;
  const authUserRef = useRef(authUser); authUserRef.current = authUser;

  const landingPanel = (role: UserRole): PanelState =>
    role === 'admin' ? { view: 'admin-dashboard' } :
    role === 'manager' ? { view: 'manager-dashboard' } :
    { view: 'viewer-devices' };

  // ----- Auth -----
  // Restore a persisted session on mount (localStorage is client-only).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PW_KEY);
      if (stored) pwOverrides.current = JSON.parse(stored);
      const id = localStorage.getItem(SESSION_KEY);
      const p = id ? MOCK_PROFILES.find((x) => x.id === id) : null;
      if (p && p.is_active) {
        const u = profileToUser(p);
        setAuthUser(u);
        setCurrentUser(u);
        setPanelState(landingPanel(u.role));
      }
    } catch { /* ignore */ }
    setAuthReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const mail = email.trim().toLowerCase();

    // Real Supabase Auth when configured.
    if (isSupabaseConfigured) {
      const supabase = getSupabase()!;
      const { data, error } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (error || !data.user) return { ok: false, error: error?.message ?? 'Sign-in failed' };
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      if (!prof) return { ok: false, error: 'No profile linked to this account' };
      const u = profileToUser(prof as Profile);
      setAuthUser(u); setCurrentUser(u); setPanelState(landingPanel(u.role));
      try { localStorage.setItem(SESSION_KEY, u.id); } catch {}
      return { ok: true };
    }

    // Demo mode — authenticate against the mock profile list.
    const p = profRef.current.find((x) => x.email.toLowerCase() === mail);
    if (!p) return { ok: false, error: 'No account found for that email.' };
    if (!p.is_active) return { ok: false, error: 'This account is suspended. Contact an administrator.' };
    const expected = pwOverrides.current[mail] ?? DEMO_PASSWORD;
    if (password !== expected) return { ok: false, error: 'Incorrect password.' };
    const u = profileToUser(p);
    setAuthUser(u); setCurrentUser(u); setPanelState(landingPanel(u.role));
    try { localStorage.setItem(SESSION_KEY, u.id); } catch {}
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    if (isSupabaseConfigured) getSupabase()?.auth.signOut();
    setAuthUser(null);
  }, []);

  const accountExists = useCallback((email: string) =>
    profRef.current.some((x) => x.email.toLowerCase() === email.trim().toLowerCase()), []);

  // Real mode: send a reset email. Demo mode: validated client-side in resetPassword.
  const requestPasswordReset = useCallback(async (email: string) => {
    const mail = email.trim().toLowerCase();
    if (isSupabaseConfigured) {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
      const { error } = await getSupabase()!.auth.resetPasswordForEmail(mail, { redirectTo });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const p = profRef.current.find((x) => x.email.toLowerCase() === mail);
    if (!p) return { ok: false, error: 'No account found for that email.' };
    if (!p.is_active) return { ok: false, error: 'This account is suspended. Contact an administrator.' };
    return { ok: true };
  }, []);

  // Demo mode: persist a new password override that login() will honor.
  const resetPassword = useCallback(async (email: string, newPassword: string) => {
    const mail = email.trim().toLowerCase();
    if (newPassword.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    if (isSupabaseConfigured) {
      const { error } = await getSupabase()!.auth.updateUser({ password: newPassword });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const p = profRef.current.find((x) => x.email.toLowerCase() === mail);
    if (!p) return { ok: false, error: 'No account found for that email.' };
    pwOverrides.current = { ...pwOverrides.current, [mail]: newPassword };
    try { localStorage.setItem(PW_KEY, JSON.stringify(pwOverrides.current)); } catch {}
    return { ok: true };
  }, []);

  // Admin-only role preview (impersonation). Non-admins stay locked to themselves.
  const switchRole = useCallback((role: UserRole) => {
    if (authUserRef.current?.role !== 'admin') return;
    setCurrentUser(DEMO_USERS[role]);
    setPanelState(landingPanel(role));
  }, []);

  const setPanel = useCallback((p: PanelState) => setPanelState(p), []);

  // ----- Live data sync (Supabase) -----
  // RLS scopes every query to the signed-in user, so this is multi-tenant safe.
  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const [orgsR, devsR, profsR, telR] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at', { ascending: true }),
      supabase.from('devices').select('*').order('created_at', { ascending: true }),
      supabase.from('profiles').select('*'),
      supabase.from('telemetry_data').select('*').order('timestamp', { ascending: false }).limit(500),
    ]);
    if (orgsR.data) setOrgs(orgsR.data as Organization[]);
    if (devsR.data) setDevices(devsR.data as Device[]);
    if (profsR.data) setProfiles(profsR.data as Profile[]);
    if (telR.data) setTelemetry((telR.data as any[]).map(normalizeTelemetry));
  }, []);
  const live = isSupabaseConfigured;
  const sb = () => getSupabase()!;

  // Initial load + lightweight polling so the dashboard reflects live hardware data.
  useEffect(() => {
    if (!live || !authReady || !authUser) return;
    let active = true;
    refresh();
    const id = setInterval(() => { if (active) refresh(); }, 8000);
    return () => { active = false; clearInterval(id); };
  }, [live, authReady, authUser, refresh]);

  // ----- Organizations -----
  const addOrg = useCallback((name: string) => {
    setOrgs((p) => [...p, { id: `org-${seq()}`, name, created_at: new Date().toISOString() }]);
    if (live) sb().from('organizations').insert({ name }).then(() => refresh());
  }, [live, refresh]);
  const updateOrg = useCallback((id: string, name: string) => {
    setOrgs((p) => p.map((o) => (o.id === id ? { ...o, name } : o)));
    if (live) sb().from('organizations').update({ name }).eq('id', id).then(() => refresh());
  }, [live, refresh]);
  const deleteOrg = useCallback((id: string) => {
    setOrgs((p) => p.filter((o) => o.id !== id));
    setDevices((p) => p.filter((d) => d.organization_id !== id));
    setProfiles((p) => p.filter((u) => u.organization_id !== id));
    if (live) sb().from('organizations').delete().eq('id', id).then(() => refresh()); // FK cascade clears devices/telemetry
  }, [live, refresh]);

  // ----- Profiles ----- (creation in live mode goes through /api/invite)
  const addProfile = useCallback((data: Omit<Profile, 'id' | 'created_at'>) =>
    setProfiles((p) => [...p, { ...data, id: `user-${seq()}`, created_at: new Date().toISOString() }]), []);
  const updateProfile = useCallback((id: string, u: Partial<Profile>) => {
    setProfiles((p) => p.map((x) => (x.id === id ? { ...x, ...u } : x)));
    if (live) sb().from('profiles').update(u).eq('id', id).then(() => refresh());
  }, [live, refresh]);
  const deleteProfile = useCallback((id: string) => {
    setProfiles((p) => p.filter((x) => x.id !== id));
    if (live) sb().from('profiles').delete().eq('id', id).then(() => refresh());
  }, [live, refresh]);

  // ----- Devices -----
  const addDevice = useCallback((data: { name: string; organization_id: string; location?: string; system_id?: string }) => {
    const token = generateToken();
    const d: Device = {
      id: `dev-${seq()}`, ...data, secret_token: token,
      status: 'offline', last_seen: null, created_at: new Date().toISOString(),
    };
    setDevices((p) => [...p, d]);
    if (live) sb().from('devices').insert({
      name: d.name, organization_id: d.organization_id, secret_token: token,
      status: 'offline', location: d.location ?? null, system_id: d.system_id ?? null,
    }).then(() => refresh());
    return d;
  }, [live, refresh]);
  const updateDevice = useCallback((id: string, u: Partial<Device>) => {
    setDevices((p) => p.map((d) => (d.id === id ? { ...d, ...u } : d)));
    if (live) sb().from('devices').update(u).eq('id', id).then(() => refresh());
  }, [live, refresh]);
  const deleteDevice = useCallback((id: string) => {
    setDevices((p) => p.filter((d) => d.id !== id));
    if (live) sb().from('devices').delete().eq('id', id).then(() => refresh());
  }, [live, refresh]);
  const regenerateToken = useCallback((id: string) => {
    const t = generateToken();
    setDevices((p) => p.map((d) => (d.id === id ? { ...d, secret_token: t } : d)));
    if (live) sb().from('devices').update({ secret_token: t }).eq('id', id).then(() => refresh());
    return t;
  }, [live, refresh]);

  // ----- Telemetry ingest + alarm engine -----
  const ingestTelemetry = useCallback((token: string, dataStr: string) => {
    const device = devRef.current.find((d) => d.secret_token === token);
    if (!device) return { ok: false, error: 'Invalid token — no device registered with this secret_token.' };
    const parsed = parseDataString(dataStr);
    if (!parsed) return { ok: false, error: 'Malformed frame. Expected ;P1,P2,P3,P4,P5,P6,P7,P8,P9:' };

    const record: TelemetryRecord = {
      id: Date.now(), device_id: device.id, timestamp: new Date().toISOString(), ...parsed,
    };

    const prev = telRef.current.find((t) => t.device_id === device.id);
    setTelemetry((p) => [record, ...p]);
    setDevices((p) => p.map((d) => (d.id === device.id ? { ...d, status: 'online', last_seen: record.timestamp } : d)));

    // Alarm 1 — level_sensor_1 toggles 1→0 AND level_sensor_2 == 0 → batch complete
    if (prev?.level_sensor_1 === 1 && record.level_sensor_1 === 0 && record.level_sensor_2 === 0) {
      setAlarms((p) => [{
        id: `alarm-${Date.now()}`, device_id: device.id, alarm_type: 'production_complete',
        message: 'Chlorine production is completed. Please start a new production.',
        timestamp: record.timestamp, acknowledged: false,
      }, ...p]);
    }
    // Alarm 2 — level_sensor_3 == 1 → NaClO depleted (debounced 1h)
    if (record.level_sensor_3 === 1) {
      const recent = alarmRef.current.find((a) =>
        a.device_id === device.id && a.alarm_type === 'no_naclo' &&
        !a.acknowledged && Date.now() - new Date(a.timestamp).getTime() < 3_600_000);
      if (!recent) {
        setAlarms((p) => [{
          id: `alarm-${Date.now() + 1}`, device_id: device.id, alarm_type: 'no_naclo',
          message: 'There is no Chlorine in the Clara system. Please immediately start a new production.',
          timestamp: record.timestamp, acknowledged: false,
        }, ...p]);
      }
    }
    return { ok: true, device, record };
  }, []);

  const addSimPacket = useCallback((p: SimPacket) =>
    setSimPackets((prev) => [p, ...prev.slice(0, 49)]), []);
  const acknowledgeAlarm = useCallback((id: string) =>
    setAlarms((p) => p.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))), []);

  // ----- RLS-style scoped selectors -----
  const getOrgDevices = useCallback((orgId: string) =>
    devRef.current.filter((d) => d.organization_id === orgId), []);
  const getDeviceTelemetry = useCallback((id: string, limit = 300) =>
    telRef.current.filter((t) => t.device_id === id).slice(0, limit), []);
  const getLatestTelemetry = useCallback((id: string) =>
    telRef.current.find((t) => t.device_id === id) ?? null, []);
  const getDeviceAlarms = useCallback((id: string) =>
    alarmRef.current.filter((a) => a.device_id === id), []);

  const getVisibleDevices = useCallback(() => {
    const u = userRef.current;
    if (u.role === 'admin') return devRef.current;
    return devRef.current.filter((d) => d.organization_id === u.organization_id);
  }, []);
  const getVisibleOrgs = useCallback(() => {
    const u = userRef.current;
    if (u.role === 'admin') return orgRef.current;
    return orgRef.current.filter((o) => o.id === u.organization_id);
  }, []);
  const getVisibleProfiles = useCallback(() => {
    const u = userRef.current;
    if (u.role === 'admin') return profRef.current;
    return profRef.current.filter((pr) => pr.organization_id === u.organization_id);
  }, []);
  const getUnackedAlarms = useCallback(() => {
    const u = userRef.current;
    const open = alarmRef.current.filter((a) => !a.acknowledged);
    if (u.role === 'admin') return open;
    const myDevices = new Set(devRef.current.filter((d) => d.organization_id === u.organization_id).map((d) => d.id));
    return open.filter((a) => myDevices.has(a.device_id));
  }, []);

  const value: Ctx = {
    authUser, authReady, login, logout,
    accountExists, requestPasswordReset, resetPassword,
    currentUser,
    isPreviewing: !!authUser && authUser.id !== currentUser.id,
    organizations, profiles, devices, telemetry, alarms, simPackets, panelState,
    switchRole, setPanel,
    addOrg, updateOrg, deleteOrg,
    addProfile, updateProfile, deleteProfile,
    addDevice, updateDevice, deleteDevice, regenerateToken,
    ingestTelemetry, addSimPacket, acknowledgeAlarm,
    getOrgDevices, getDeviceTelemetry, getLatestTelemetry, getDeviceAlarms,
    getVisibleDevices, getVisibleOrgs, getVisibleProfiles, getUnackedAlarms,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
