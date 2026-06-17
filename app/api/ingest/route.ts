import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { parseDataString } from '@/lib/utils';

/**
 * Hardware ingest endpoint for Clara SIM800L field nodes.
 *
 * Field nodes POST raw, unencrypted `application/x-www-form-urlencoded` bodies
 * (the SIM800L cannot do modern TLS) shaped exactly as:
 *     token=<secret_token>&data=;P1,P2,P3,P4,P5,P6,P7,P8,P9:
 * carrying the programmatic headers `User-Agent: field-node` and
 * `ngrok-skip-browser-warning: 69420` to bypass edge warning screens.
 *
 * When NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set the frame is
 * persisted; otherwise the route runs in demo mode and just echoes the parse.
 */

// SIM800L sends without a reliable content-type — always read the raw body.
async function readToken(request: NextRequest): Promise<{ token: string | null; data: string | null }> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const j = await request.json().catch(() => ({}));
    return { token: j.token ?? null, data: j.data ?? null };
  }
  const body = await request.text();
  const params = new URLSearchParams(body);
  return { token: params.get('token'), data: params.get('data') };
}

export async function POST(request: NextRequest) {
  const { token, data } = await readToken(request);

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  if (!data)  return NextResponse.json({ error: 'Missing data' }, { status: 400 });

  const parsed = parseDataString(data);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid frame. Expected ;P1,P2,P3,P4,P5,P6,P7,P8,P9:' },
      { status: 422 },
    );
  }

  const supabase = getSupabaseAdmin();

  // ---- Demo mode (no Supabase configured) ----
  if (!supabase) {
    return NextResponse.json({
      status: 'ok',
      mode: 'demo',
      note: 'Supabase not configured — frame parsed but not persisted.',
      parsed,
      received_at: new Date().toISOString(),
    });
  }

  // ---- Persisted path ----
  const { data: device, error: devErr } = await supabase
    .from('devices')
    .select('id, name, organization_id')
    .eq('secret_token', token)
    .single();

  if (devErr || !device) {
    return NextResponse.json({ error: 'Unknown token — device not registered' }, { status: 404 });
  }

  const ts = new Date().toISOString();

  // Previous frame's level_sensor_1 for the production-complete transition.
  const { data: prevRows } = await supabase
    .from('telemetry_data')
    .select('level_sensor_1')
    .eq('device_id', device.id)
    .order('timestamp', { ascending: false })
    .limit(1);
  const prevL1 = prevRows?.[0] ? Number(prevRows[0].level_sensor_1) : null;

  const { error: insErr } = await supabase
    .from('telemetry_data')
    .insert({ device_id: device.id, ...parsed, timestamp: ts });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await supabase.from('devices').update({ status: 'online', last_seen: ts }).eq('id', device.id);

  // ---- Server-side alarm engine ----
  if (prevL1 === 1 && parsed.level_sensor_1 === 0 && parsed.level_sensor_2 === 0) {
    await supabase.from('alarms').insert({
      device_id: device.id, alarm_type: 'production_complete', severity: 'warning',
      message: 'Chlorine production is completed. Please start a new production.', timestamp: ts,
    });
  }
  if (parsed.level_sensor_3 === 1) {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { data: recent } = await supabase
      .from('alarms')
      .select('id')
      .eq('device_id', device.id).eq('alarm_type', 'no_naclo').eq('acknowledged', false)
      .gte('timestamp', since).limit(1);
    if (!recent || recent.length === 0) {
      await supabase.from('alarms').insert({
        device_id: device.id, alarm_type: 'no_naclo', severity: 'critical',
        message: 'There is no Chlorine in the Clara system. Please immediately start a new production.', timestamp: ts,
      });
    }
  }

  // ---- Threshold-based alarm rules (S1-2) ----
  const { data: rules } = await supabase
    .from('alarm_rules')
    .select('*')
    .eq('org_id', device.organization_id)
    .eq('is_active', true);

  if (rules && rules.length > 0) {
    const since = new Date(Date.now() - 3600e3).toISOString();
    for (const rule of rules) {
      // Skip rules scoped to a different device
      if (rule.device_id && rule.device_id !== device.id) continue;

      const frameValue = (parsed as unknown as Record<string, number>)[rule.parameter];
      if (frameValue === undefined) continue;

      const threshold = Number(rule.threshold);
      let breached = false;
      if (rule.condition === 'lt')  breached = frameValue <  threshold;
      if (rule.condition === 'lte') breached = frameValue <= threshold;
      if (rule.condition === 'gt')  breached = frameValue >  threshold;
      if (rule.condition === 'gte') breached = frameValue >= threshold;
      if (rule.condition === 'eq')  breached = frameValue === threshold;

      if (!breached) continue;

      // Debounce: skip if same rule fired within the last hour and is unacknowledged
      const { data: dupe } = await supabase
        .from('alarms')
        .select('id')
        .eq('device_id', device.id)
        .eq('alarm_type', 'threshold_breach')
        .eq('rule_id', rule.id)
        .eq('acknowledged', false)
        .gte('timestamp', since)
        .limit(1);

      if (dupe && dupe.length > 0) continue;

      const label = rule.label ?? `${rule.parameter} ${rule.condition} ${rule.threshold}`;
      await supabase.from('alarms').insert({
        device_id: device.id,
        alarm_type: 'threshold_breach',
        severity: rule.severity,
        rule_id: rule.id,
        parameter: rule.parameter,
        value: frameValue,
        message: `Threshold breach: ${label} (value: ${frameValue})`,
        timestamp: ts,
      });
    }
  }

  return NextResponse.json({ status: 'ok', mode: 'persisted', device: device.name, received_at: ts, parsed });
}

export async function GET() {
  return NextResponse.json({
    service: 'Ever Spark Monitoring — Ingest API',
    version: '1.0',
    status: 'healthy',
    format: 'POST token=<secret_token>&data=;P1..P9:',
    headers: { 'User-Agent': 'field-node', 'ngrok-skip-browser-warning': '69420' },
    parameters: {
      P1: 'flow_rate (L/min)', P2: 'voltage (V)',
      P3: 'level_sensor_1 (0|1)', P4: 'level_sensor_2 (0|1)', P5: 'level_sensor_3 (0|1)',
      P6: 'naclo_pumped (L)', P7: 'target_frc (mg/L)', P8: 'active_chlorine (mg/L)', P9: 'ph_value',
    },
  });
}
