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
  const { error: insErr } = await supabase
    .from('telemetry_data')
    .insert({ device_id: device.id, ...parsed, timestamp: ts });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await supabase.from('devices').update({ status: 'online', last_seen: ts }).eq('id', device.id);

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
