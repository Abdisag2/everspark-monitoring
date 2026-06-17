import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/export?org_id=<id>&from=<ISO>&to=<ISO>&devices=all
 *
 * Streams a CSV containing telemetry for all (or one) device(s) in an org.
 * Requires a valid Supabase session JWT in the Authorization header.
 * Managers can only export their own org; admins can export any.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId     = searchParams.get('org_id');
  const deviceId  = searchParams.get('device_id');  // optional: scope to one device
  const fromTs    = searchParams.get('from');
  const toTs      = searchParams.get('to');

  if (!orgId) {
    return NextResponse.json({ error: 'Missing org_id parameter' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured — export requires live mode' }, { status: 503 });
  }

  // Verify the caller's session and org scope via admin client
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

  // Managers can only export their own org; viewers cannot export
  if (profile.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
  }
  if (profile.role === 'manager' && profile.organization_id !== orgId) {
    return NextResponse.json({ error: 'Forbidden: can only export your own organization' }, { status: 403 });
  }

  // Fetch devices for the org
  let devQuery = supabase.from('devices').select('id, name').eq('organization_id', orgId);
  if (deviceId) devQuery = devQuery.eq('id', deviceId);
  const { data: devices, error: devErr } = await devQuery;
  if (devErr || !devices) return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });

  const deviceIds = devices.map((d) => d.id);
  const deviceMap: Record<string, string> = Object.fromEntries(devices.map((d) => [d.id, d.name]));

  if (deviceIds.length === 0) {
    return new NextResponse('device_name,timestamp,flow_rate,voltage,level_sensor_1,level_sensor_2,level_sensor_3,naclo_pumped,target_frc,active_chlorine,ph_value\n', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="everspark-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // Fetch telemetry
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

  const header = 'device_name,timestamp,flow_rate,voltage,level_sensor_1,level_sensor_2,level_sensor_3,naclo_pumped,target_frc,active_chlorine,ph_value\n';
  const csv = header + (rows ?? []).map((r) => [
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

  const filename = `everspark-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
