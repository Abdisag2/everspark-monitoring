import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  computeReport, reportToCsv, metricRows, reportSlug,
  dueWindow, FREQ_NOUN,
} from '@/lib/report';
import { renderReportPdf } from '@/lib/report-pdf';
import type { TelemetryRecord, ReportFrequency } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // reports for many devices can take a while

const ALL_FREQUENCIES: ReportFrequency[] = ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'];

/**
 * Scheduled reports (daily / weekly / monthly / quarterly / semiannual / yearly).
 *
 * Triggered by Vercel Cron once a day (see vercel.json). Each run decides which
 * cadences are DUE that day (daily every day, weekly on Mondays, the rest on the
 * 1st of the period that just closed), builds each subscribed device's CSV +
 * branded PDF for that window, and emails one message per (user, cadence) via SES.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Idempotent: a
 * (user, device, period_start) already in monthly_report_log is skipped, so a cron
 * retry never double-sends. Pass ?date=YYYY-MM-DD to simulate a given day's run.
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

  // Run date: now, or ?date=YYYY-MM-DD to simulate a given day's run (testing).
  const dParam = new URL(req.url).searchParams.get('date');
  const ref = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) ? new Date(`${dParam}T06:00:00Z`) : new Date();

  // Which cadences are due on this day, and their windows.
  const dueByFreq = new Map<ReportFrequency, { fromMs: number; toMs: number; label: string; periodStart: string }>();
  for (const f of ALL_FREQUENCIES) { const w = dueWindow(f, ref); if (w) dueByFreq.set(f, w); }
  if (dueByFreq.size === 0) {
    return NextResponse.json({ ok: true, date: ref.toISOString().slice(0, 10), due: [], emails: 0 });
  }
  const duePeriodStarts = [...new Set([...dueByFreq.values()].map((w) => w.periodStart))];

  // Load everyone's subscriptions + the lookups we need (service role → all rows).
  const [subsR, profsR, devsR, orgsR, logsR] = await Promise.all([
    admin.from('report_subscriptions').select('user_id, device_id, frequency'),
    admin.from('profiles').select('id, email, name, is_active, role, organization_id'),
    admin.from('devices').select('id, name, system_id, location, sim_number, organization_id'),
    admin.from('organizations').select('id, name'),
    admin.from('monthly_report_log').select('user_id, device_id, period_start').in('period_start', duePeriodStarts),
  ]);

  const subs = subsR.data ?? [];
  const profById = new Map((profsR.data ?? []).map((p: any) => [p.id, p]));
  const devById = new Map((devsR.data ?? []).map((d: any) => [d.id, d]));
  const orgName = new Map((orgsR.data ?? []).map((o: any) => [o.id, o.name]));
  const already = new Set((logsR.data ?? []).map((l: any) => `${l.user_id}|${l.device_id}|${l.period_start}`));

  // Group due, eligible (visible, active, not-yet-sent) subscriptions by (user, cadence).
  type Window = { fromMs: number; toMs: number; label: string; periodStart: string };
  type Group = { userId: string; freq: ReportFrequency; win: Window; deviceIds: string[] };
  const groups = new Map<string, Group>();
  for (const s of subs as any[]) {
    const freq = s.frequency as ReportFrequency;
    const win = dueByFreq.get(freq);
    if (!win) continue;                                       // this cadence isn't due today
    const prof: any = profById.get(s.user_id);
    const dev: any = devById.get(s.device_id);
    if (!prof || !prof.is_active || !dev) continue;
    const canSee = prof.role === 'admin' || dev.organization_id === prof.organization_id;
    if (!canSee) continue;
    if (already.has(`${s.user_id}|${s.device_id}|${win.periodStart}`)) continue;
    const key = `${s.user_id}|${freq}`;
    const g: Group = groups.get(key) ?? { userId: s.user_id, freq, win, deviceIds: [] };
    g.deviceIds.push(s.device_id);
    groups.set(key, g);
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

  for (const g of groups.values()) {
    const prof: any = profById.get(g.userId);
    if (!prof?.email) continue;
    const noun = FREQ_NOUN[g.freq];
    const fromISO = new Date(g.win.fromMs).toISOString();
    const toISO = new Date(g.win.toMs).toISOString();

    const attachments: { filename: string; contentType: string; bytes: Buffer }[] = [];
    const summaries: { name: string; rows: { label: string; value: string; unit: string }[] }[] = [];
    const logRows: any[] = [];

    for (const deviceId of g.deviceIds) {
      const dev: any = devById.get(deviceId);
      try {
        const rows = await fetchMonth(admin, deviceId, fromISO, toISO);
        const model = computeReport(rows, {
          device: dev,
          orgName: orgName.get(dev.organization_id),
          fromMs: g.win.fromMs, toMs: g.win.toMs, periodLabel: g.win.label,
        });
        const csv = reportToCsv(rows);
        const pdf = await renderReportPdf(model, g.freq);
        const slug = reportSlug(dev.system_id ?? dev.id, g.win.label);
        attachments.push({ filename: `${slug}.csv`, contentType: 'text/csv; charset=UTF-8', bytes: Buffer.from(csv, 'utf8') });
        attachments.push({ filename: `${slug}.pdf`, contentType: 'application/pdf', bytes: Buffer.from(pdf) });
        summaries.push({ name: dev.name, rows: metricRows(model.metrics) });
        logRows.push({ user_id: g.userId, device_id: deviceId, period_start: g.win.periodStart });
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
        subject: `Ever Spark ${noun.toLowerCase()} report - ${g.win.label}`,
        text: textBody(prof.name, noun, g.win.label, summaries),
        html: htmlBody(prof.name, noun, g.win.label, summaries),
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

  return NextResponse.json({
    ok: true, date: ref.toISOString().slice(0, 10),
    due: [...dueByFreq.keys()], emails, deviceReports, groups: groups.size, errors,
  });
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
function textBody(name: string, noun: string, period: string, summaries: { name: string; rows: { label: string; value: string; unit: string }[] }[]): string {
  const blocks = summaries.map((s) =>
    `${s.name}\n` + s.rows.map((r) => `  ${r.label}: ${r.value}${r.unit ? ' ' + r.unit : ''}`).join('\n'),
  ).join('\n\n');
  return `Hi ${name || 'there'},

Here is your Ever Spark ${noun.toLowerCase()} report for ${period}.

${blocks}

A detailed PDF summary and the full CSV data are attached for each device.

— Ever Spark Monitoring
You receive this because scheduled reports are on for your account. Change the cadence or turn them off any time on the app's Reports page.`;
}

function htmlBody(name: string, noun: string, period: string, summaries: { name: string; rows: { label: string; value: string; unit: string }[] }[]): string {
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
    <span style="float:right;font-size:12px;opacity:.9">${escapeHtml(noun)} report · ${escapeHtml(period)}</span>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:20px">
    <p style="font-size:14px;margin:0 0 16px">Hi ${escapeHtml(name || 'there')}, here is your ${escapeHtml(noun.toLowerCase())} monitoring summary for <b>${escapeHtml(period)}</b>.</p>
    ${cards}
    <p style="font-size:12px;color:#94a3b8;margin-top:18px">A PDF summary and the full CSV data are attached for each device. Manage the cadence any time from the app's Reports page.</p>
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
