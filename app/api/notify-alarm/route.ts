import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export const runtime = 'nodejs'; // AWS SDK needs the Node runtime, not Edge

/**
 * Alarm → email fan-out.
 *
 * Fired by a Supabase Database Webhook on INSERT into public.alarms (so it
 * covers alarms raised from any ingest path — Vercel /api/ingest, the EC2 HTTP
 * server, and the MQTT subscriber). Emails every ACTIVE user in the device's
 * org who has opted in (profiles.alarm_email_enabled), via Amazon SES.
 *
 * Secured by a shared secret header. Idempotent: an alarm already stamped
 * notified_at is skipped, so webhook retries don't double-send.
 */
const ALARM_LABELS: Record<string, string> = {
  production_complete: 'Production complete',
  no_naclo: 'NaClO depleted',
};

export async function POST(req: NextRequest) {
  const secret = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = await req.json().catch(() => ({} as any));
  const incoming = body?.record ?? body;                 // Supabase webhook shape: { type, record, ... }
  const alarmId = incoming?.id;
  if (!alarmId) return NextResponse.json({ error: 'No alarm id in payload' }, { status: 400 });

  // Load the authoritative row (and dedupe).
  const { data: alarm } = await admin
    .from('alarms')
    .select('id, device_id, alarm_type, message, timestamp, notified_at')
    .eq('id', alarmId)
    .single();
  if (!alarm) return NextResponse.json({ error: 'Alarm not found' }, { status: 404 });
  if (alarm.notified_at) return NextResponse.json({ ok: true, skipped: 'already notified' });

  const { data: device } = await admin
    .from('devices')
    .select('id, name, organization_id')
    .eq('id', alarm.device_id)
    .single();
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

  // Recipients: opted-in, active users who are EITHER in the device's org
  // OR a platform admin (admins receive alarms for every device). Deduped by
  // email in case the same address matches both conditions.
  const { data: rows } = await admin
    .from('profiles')
    .select('email, name')
    .eq('alarm_email_enabled', true)
    .eq('is_active', true)
    .or(`organization_id.eq.${device.organization_id},role.eq.admin`);
  const recipients = dedupeByEmail(rows ?? []);

  const from = process.env.ALARM_FROM_EMAIL || 'no-reply@eversparktech.com';
  const label = ALARM_LABELS[alarm.alarm_type] ?? alarm.alarm_type;
  const when = new Date(alarm.timestamp).toUTCString();

  let sent = 0;
  if (recipients && recipients.length) {
    const ses = new SESv2Client({
      region: process.env.SES_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.SES_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.SES_SECRET_ACCESS_KEY || '',
      },
    });

    const subject = `⚠ ${label} — ${device.name}`;
    const text =
`Alarm: ${label}
Device: ${device.name}
Detail: ${alarm.message}
Time:  ${when}

— Ever Spark Monitoring
You get this because device-alarm emails are on for your account. Turn them off in the app's notifications menu (bell icon).`;
    const html =
`<div style="font-family:Inter,Arial,sans-serif;max-width:480px">
  <h2 style="color:#b91c1c;margin:0 0 8px">⚠ ${escapeHtml(label)}</h2>
  <table style="font-size:14px;color:#334155;border-collapse:collapse">
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">Device</td><td><b>${escapeHtml(device.name)}</b></td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">Detail</td><td>${escapeHtml(alarm.message)}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">Time</td><td>${escapeHtml(when)}</td></tr>
  </table>
  <p style="font-size:12px;color:#94a3b8;margin-top:16px">Ever Spark Monitoring · turn off alarm emails any time from the app's notifications menu.</p>
</div>`;

    for (const r of recipients) {
      try {
        await ses.send(new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [r.email] },
          Content: { Simple: {
            Subject: { Data: subject },
            Body: { Text: { Data: text }, Html: { Data: html } },
          } },
        }));
        sent++;
      } catch (e: any) {
        console.error('[everspark] alarm email failed for', r.email, '-', e?.message);
      }
    }
  }

  // Stamp as notified even if there were no recipients, so we don't re-scan it.
  await admin.from('alarms').update({ notified_at: new Date().toISOString() }).eq('id', alarmId);

  return NextResponse.json({ ok: true, recipients: recipients?.length ?? 0, sent });
}

function dedupeByEmail<T extends { email: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = (r.email || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
