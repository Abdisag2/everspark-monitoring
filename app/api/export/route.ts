import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { MOCK_DEVICES, MOCK_TELEMETRY } from '@/lib/mock-data';

const CSV_HEADER = 'device_name,timestamp,flow_rate,voltage,level_sensor_1,level_sensor_2,level_sensor_3,naclo_pumped,target_frc,active_chlorine,ph_value\n';

function rowsToCsv(rows: { device_id: string; timestamp: string; flow_rate: number; voltage: number; level_sensor_1: number; level_sensor_2: number; level_sensor_3: number; naclo_pumped: number; target_frc: number; active_chlorine: number; ph_value: number }[], deviceMap: Record<string, string>) {
  return CSV_HEADER + rows.map((r) => [
    JSON.stringify(deviceMap[r.device_id] ?? r.device_id),
    r.timestamp,
    r.flow_rate,
    r.voltage,
    r.level_sensor_1,
    r.level_sensor_2,
    r.level_sensor_3,
    r.naclo_pumped,
    r.target_frc,
    r.active_chlorine,
    r.ph_value,
  ].join(',')).join('\n');
}

function csvResponse(csv: string, orgName: string) {
  const filename = `everspark-${orgName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/**
 * GET /api/export?org_id=<id>&from=<ISO>&to=<ISO>&device_id=<id>
 *
 * Downloads a CSV of telemetry for all (or one) device(s) in an org.
 * - Demo mode (no Supabase): no auth required, serves from in-memory mock data.
 * - Live mode: requires a valid Supabase session JWT in Authorization header.
 *   Admins can export any org; managers only their own org; viewers are blocked.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId    = searchParams.get('org_id');
  const deviceId = searchParams.get('device_id');
  const fromTs   = searchParams.get('from');
  const toTs     = searchParams.get('to');

  if (!orgId) {
    return NextResponse.json({ error: 'Missing org_id parameter' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // ── DEMO MODE ─────────────────────────────────────────────────────────────
  if (!supabase) {
    let devs = MOCK_DEVICES.filter((d) => d.organization_id === orgId);
    if (deviceId) devs = devs.filter((d) => d.id === deviceId);
    const deviceMap: Record<string, string> = Object.fromEntries(devs.map((d) => [d.id, d.name]));
    const devIds = new Set(devs.map((d) => d.id));
    let rows = MOCK_TELEMETRY.filter((t) => devIds.has(t.device_id));
    if (fromTs) rows = rows.filter((t) => t.timestamp >= fromTs);
    if (toTs)   rows = rows.filter((t) => t.timestamp <= toTs);
    const orgName = orgId; // mock: use id as name fallback — real name lookup not needed here
    return csvResponse(rowsToCsv(rows, deviceMap), orgName);
  }

  // ── LIVE MODE ─────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 403 });

  if (profile.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
  }
  if (profile.role === 'manager' && profile.organization_id !== orgId) {
    return NextResponse.json({ error: 'Forbidden: can only export your own organization' }, { status: 403 });
  }
  // admin: allowed to export any org — no restriction needed

  // Fetch org name for filename
  const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single();
  const orgName = org?.name ?? orgId;

  // Fetch devices
  let devQuery = supabase.from('devices').select('id, name').eq('organization_id', orgId);
  if (deviceId) devQuery = devQuery.eq('id', deviceId);
  const { data: devices, error: devErr } = await devQuery;
  if (devErr || !devices) return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });

  const deviceIds = devices.map((d: { id: string }) => d.id);
  const deviceMap: Record<string, string> = Object.fromEntries(devices.map((d: { id: string; name: string }) => [d.id, d.name]));

  if (deviceIds.length === 0) return csvResponse(CSV_HEADER, orgName);

  let telQuery = supabase
    .from('telemetry_data')
    .select('device_id, timestamp, flow_rate, voltage, level_sensor_1, level_sensor_2, level_sensor_3, naclo_pumped, target_frc, active_chlorine, ph_value')
    .in('device_id', deviceIds)
    .order('timestamp', { ascending: false })
    .limit(50000);

  if (fromTs) telQuery = telQuery.gte('timestamp', fromTs);
  if (toTs)   telQuery = telQuery.lte('timestamp', toTs);

  const { data: rows, error: telErr } = await telQuery;
  if (telErr) return NextResponse.json({ error: telErr.message }, { status: 500 });

  return csvResponse(rowsToCsv(rows ?? [], deviceMap), orgName);
}
