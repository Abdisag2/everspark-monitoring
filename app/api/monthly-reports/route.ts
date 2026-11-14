import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  computeReport, reportToCsv, metricRows, reportSlug,
  previousMonthWindow, monthWindow,
} from '@/lib/report';
import { renderReportPdf } from '@/lib/report-pdf';
import type { TelemetryRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // reports for many devices can take a while

/**
 * Scheduled monthly reports.
 *
 * Triggered by Vercel Cron on the 1st of each month (see vercel.json). For every
 * user who subscribed a device on the Notifications page, builds that device's
 * previous-month CSV + branded PDF and emails them (one email per user, covering
 * all their subscribed devices) via Amazon SES.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Idempotent: a
 * (user, device, month) already in monthly_report_log is skipped, so a cron retry
 * never double-sends. Pass ?month=YYYY-MM to (re)generate a specific month manually.
 */
export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const from = process.env.ALARM_FROM_EMAIL || 'no-reply@eversparktech.com';
  if (!process.env.SES_ACCESS_KEY_ID || !process.env.SES_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: 'SES not configured' }, { status: 503 });
  }

  // Which month? Default = the month that just ended. ?month=YYYY-MM overrides.
  const mParam = new URL(req.url).searchParams.get('month');
  const win = mParam && /^\d{4}-\d{2}$/.test(mParam)
    ? monthWindow(Number(mParam.slice(0, 4)), Number(mParam.slice(5, 7)) - 1)
    : previousMonthWindow();
  const periodStart = new Date(win.fromMs).toISOString().slice(0, 10); // YYYY-MM-01
  const fromISO = new Date(win.fromMs).toISOString();
  const toISO = new Date(win.toMs).toISOString();

  // Load everyone's subscriptions + the lookups we need (service role → all rows).
  const [subsR, profsR, devsR, orgsR, logsR] = await Promise.all([
    admin.from('report_subscriptions').select('user_id, device_id'),
    admin.from('profiles').select('id, email, name, is_active, role, organization_id'),
    admin.from('devices').select('id, name, system_id, location, sim_number, organization_id'),
    admin.from('organizations').select('id, name'),
    admin.from('monthly_report_log').select('user_id, device_id').eq('period_start', periodStart),
  ]);

  const subs = subsR.data ?? [];
  const profById = new Map((profsR.data ?? []).map((p: any) => [p.id, p]));
  const devById = new Map((devsR.data ?? []).map((d: any) => [d.id, d]));
  const orgName = new Map((orgsR.data ?? []).map((o: any) => [o.id, o.name]));
  const already = new Set((logsR.data ?? []).map((l: any) => `${l.user_id}|${l.device_id}`));

  // Group eligible (visible, active, not-yet-sent) device subscriptions per user.
  const byUser = new Map<string, string[]>();
  for (const s of subs) {
    const prof: any = profById.get(s.user_id);
    const dev: any = devById.get(s.device_id);
    if (!prof || !prof.is_active || !dev) continue;
    const canSee = prof.role === 'admin' || dev.organization_id === prof.organization_id;
    if (!canSee) continue;
    if (already.has(`${s.user_id}|${s.device_id}`)) continue;
    const list = byUser.get(s.user_id) ?? [];
    list.push(s.device_id);
    byUser.set(s.user_id, list);
  }

  const ses = new SESv2Client({
    region: process.env.SES_REGION || 'eu-central-1',
    credentials: {
      accessKeyId: process.env.SES_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.SES_SECRET_ACCESS_KEY || '',
    },
  });

  let emails = 0, deviceReports = 0;
  const errors: string[] = [];

  for (const [userId, deviceIds] of byUser) {
    const prof: any = profById.get(userId);
    if (!prof?.email) continue;

    const attachments: { filename: string; contentType: string; bytes: Buffer }[] = [];
    const summaries: { name: string; rows: { label: string; value: string; unit: string }[] }[] = [];
    const logRows: any[] = [];

    for (const deviceId of deviceIds) {
      const dev: any = devById.get(deviceId);
      try {
        const rows = await fetchMonth(admin, deviceId, fromISO, toISO);
        const model = computeReport(rows, {
          device: dev,
          orgName: orgName.get(dev.organization_id),
          fromMs: win.fromMs, toMs: win.toMs, periodLabel: win.label,
        });
        const csv = reportToCsv(rows);
        const pdf = await renderReportPdf(model, 'monthly');
        const slug = reportSlug(dev.system_id ?? dev.id, win.label);
        attachments.push({ filename: `${slug}.csv`, contentType: 'text/csv; charset=UTF-8', bytes: Buffer.from(csv, 'utf8') });
        attachments.push({ filename: `${slug}.pdf`, contentType: 'application/pdf', bytes: Buffer.from(pdf) });
        summaries.push({ name: dev.name, rows: metricRows(model.metrics) });
        logRows.push({ user_id: userId, device_id: deviceId, period_start: periodStart });
        deviceReports++;
      } catch (e: any) {
        errors.push(`${prof.email}/${dev?.name ?? deviceId}: ${e?.message || e}`);
      }
    }

    if (!attachments.length) continue;

    try {
      const raw = buildRawEmail({
        from,
        to: prof.email,
        subject: `Ever Spark monthly report - ${win.label}`,
        text: textBody(prof.name, win.label, summaries),
        html: htmlBody(prof.name, win.label, summaries),
        attachments,
      });
      await ses.send(new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [prof.email] },
        Content: { Raw: { Data: raw } },
      }));
      emails++;
      // Stamp only after a successful send, so a failure is retried next run.
      await admin.from('monthly_report_log').upsert(logRows, { onConflict: 'user_id,device_id,period_start', ignoreDuplicates: true });
    } catch (e: any) {
      errors.push(`send ${prof.email}: ${e?.message || e}`);
    }
  }

  return NextResponse.json({ ok: true, period: win.label, emails, deviceReports, users: byUser.size, errors });
}

// ---- Telemetry: every frame in [fromISO, toISO) via paginated admin query ----
async function fetchMonth(admin: any, deviceId: string, fromISO: string, toISO: string): Promise<TelemetryRecord[]> {
  const out: TelemetryRecord[] = [];
  const PAGE = 1000;
  for (let i = 0; i < 1_000_000; i += PAGE) {
    const { data, error } = await admin
      .from('telemetry_data')
      .select('*')
      .eq('device_id', deviceId)
      .gte('timestamp', fromISO)
      .lt('timestamp', toISO)
      .order('timestamp', { ascending: true })
      .range(i, i + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as TelemetryRecord[]));
    if (data.length < PAGE) break;
  }
  return out;
}

// ---- Email bodies ----
function textBody(name: string, period: string, summaries: { name: string; rows: { label: string; value: string; unit: string }[] }[]): string {
  const blocks = summaries.map((s) =>
    `${s.name}\n` + s.rows.map((r) => `  ${r.label}: ${r.value}${r.unit ? ' ' + r.unit : ''}`).join('\n'),
  ).join('\n\n');
  return `Hi ${name || 'there'},

Here is your Ever Spark monitoring report for ${period}.

${blocks}

A detailed PDF summary and the full CSV data are attached for each device.

— Ever Spark Monitoring
You receive this because monthly reports are on for your account. Turn them off any time in the app's Notifications page.`;
}

function htmlBody(name: string, period: string, summaries: { name: string; rows: { label: string; value: string; unit: string }[] }[]): string {
  const cards = summaries.map((s) => `
    <div style="margin:0 0 18px">
      <p style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px">${escapeHtml(s.name)}</p>
      <table style="font-size:13px;color:#334155;border-collapse:collapse">
        ${s.rows.map((r) => `<tr>
          <td style="padding:3px 16px 3px 0;color:#64748b">${escapeHtml(r.label)}</td>
          <td style="font-weight:600">${escapeHtml(r.value)}${r.unit ? ' <span style="color:#94a3b8;font-weight:400">' + escapeHtml(r.unit) + '</span>' : ''}</td>
        </tr>`).join('')}
      </table>
    </div>`).join('');
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;color:#334155">
  <div style="background:#0d8e87;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
    <span style="font-size:18px;font-weight:800;letter-spacing:.5px">EVER SPARK</span>
    <span style="float:right;font-size:12px;opacity:.9">Monthly report · ${escapeHtml(period)}</span>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:20px">
    <p style="font-size:14px;margin:0 0 16px">Hi ${escapeHtml(name || 'there')}, here is your monitoring summary for <b>${escapeHtml(period)}</b>.</p>
    ${cards}
    <p style="font-size:12px;color:#94a3b8;margin-top:18px">A PDF summary and the full CSV data are attached for each device. Manage monthly reports any time from the app's Notifications page.</p>
  </div>
</div>`;
}

// ---- Raw MIME builder (multipart/mixed with base64 parts + attachments) ----
function buildRawEmail(o: {
  from: string; to: string; subject: string; text: string; html: string;
  attachments: { filename: string; contentType: string; bytes: Buffer }[];
}): Buffer {
  const rand = () => Math.random().toString(36).slice(2);
  const mixed = `mixed_${Date.now()}_${rand()}`;
  const alt = `alt_${Date.now()}_${rand()}`;
  const L: string[] = [];
  L.push(`From: ${o.from}`);
  L.push(`To: ${o.to}`);
  L.push(`Subject: ${encodeWord(o.subject)}`);
  L.push('MIME-Version: 1.0');
  L.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, '');
  L.push(`--${mixed}`);
  L.push(`Content-Type: multipart/alternative; boundary="${alt}"`, '');
  L.push(`--${alt}`);
  L.push('Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '');
  L.push(wrap64(Buffer.from(o.text, 'utf8')));
  L.push(`--${alt}`);
  L.push('Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '');
  L.push(wrap64(Buffer.from(o.html, 'utf8')));
  L.push(`--${alt}--`);
  for (const a of o.attachments) {
    L.push(`--${mixed}`);
    L.push(`Content-Type: ${a.contentType}; name="${a.filename}"`);
    L.push('Content-Transfer-Encoding: base64');
    L.push(`Content-Disposition: attachment; filename="${a.filename}"`, '');
    L.push(wrap64(a.bytes));
  }
  L.push(`--${mixed}--`, '');
  return Buffer.from(L.join('\r\n'), 'utf8');
}

function wrap64(buf: Buffer): string {
  return (buf.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}
function encodeWord(s: string): string {
  // RFC 2047 encoded-word so non-ASCII subjects survive.
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
