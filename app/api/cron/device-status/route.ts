import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Cron endpoint — runs every 5 minutes via Vercel cron.
 * Flips devices offline when last_seen exceeds their offline_threshold_minutes,
 * raises device_offline alarms, and clears devices that have reconnected.
 *
 * Must be called with Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ status: 'skip', reason: 'Supabase not configured' });
  }

  const ts = new Date().toISOString();
  const since1h = new Date(Date.now() - 3_600_000).toISOString();
  const since1m = new Date(Date.now() - 60_000).toISOString();

  // ---- 1. Mark devices offline ----
  // Fetch online devices whose last_seen exceeds their threshold
  const { data: onlineDevices } = await supabase
    .from('devices')
    .select('id, organization_id, name, last_seen, offline_threshold_minutes')
    .eq('status', 'online');

  const toFlipOffline = (onlineDevices ?? []).filter((d) => {
    if (!d.last_seen) return true;
    const thresholdMs = (d.offline_threshold_minutes ?? 15) * 60_000;
    return Date.now() - new Date(d.last_seen).getTime() > thresholdMs;
  });

  let offlineCount = 0;
  for (const device of toFlipOffline) {
    await supabase.from('devices').update({ status: 'offline' }).eq('id', device.id);

    // Debounce: only raise alarm if none in the last hour
    const { data: recent } = await supabase
      .from('alarms')
      .select('id')
      .eq('device_id', device.id)
      .eq('alarm_type', 'device_offline')
      .gte('timestamp', since1h)
      .limit(1);

    if (!recent || recent.length === 0) {
      await supabase.from('alarms').insert({
        device_id: device.id,
        alarm_type: 'device_offline',
        severity: 'warning',
        message: `Device "${device.name}" has gone offline (no data received).`,
        timestamp: ts,
      });
    }
    offlineCount++;
  }

  // ---- 2. Mark devices reconnected ----
  // Fetch offline devices that sent a frame in the last minute
  const { data: offlineDevices } = await supabase
    .from('devices')
    .select('id, organization_id, name, last_seen')
    .eq('status', 'offline')
    .not('last_seen', 'is', null)
    .gte('last_seen', since1m);

  let reconnectedCount = 0;
  for (const device of offlineDevices ?? []) {
    await supabase.from('devices').update({ status: 'online' }).eq('id', device.id);
    await supabase.from('alarms').insert({
      device_id: device.id,
      alarm_type: 'device_reconnected',
      severity: 'info',
      message: `Device "${device.name}" has reconnected.`,
      timestamp: ts,
    });
    reconnectedCount++;
  }

  return NextResponse.json({
    status: 'ok',
    ran_at: ts,
    flipped_offline: offlineCount,
    reconnected: reconnectedCount,
  });
}
