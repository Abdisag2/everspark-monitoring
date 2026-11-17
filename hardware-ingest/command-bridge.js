/**
 * Ever Spark — remote-calibration command bridge (downlink + uplink).
 *
 * The reverse direction of mqtt-subscriber.js. It drains the device_commands
 * queue in Supabase and drives it over MQTT to the site gateway, then writes the
 * device's answer back. Runs on the SAME VM/broker as the telemetry subscriber.
 *
 *   1. Poll   device_commands where status='queued'
 *                 -> publish  everspark/<secret_token>/cmd   { id, line }
 *                 -> mark the row 'sent'
 *   2. Listen  everspark/<secret_token>/cmd/ack  { id, response, ok? }
 *                 -> write the row 'acked' (ok) / 'error' (not ok)
 *   3. Sweep   rows stuck in 'sent' past CMD_TIMEOUT_MS -> 'timeout'
 *
 * Clara answers one line at a time, so only ONE command per device is in flight;
 * the next queued row for that device waits until the current one resolves.
 *
 * The gateway must deliver `line` + '\n' to Clara over RS485 while Clara is in
 * remote mode, read the reply (a line that does NOT start with ';'), and publish
 * it to the ack topic. See docs/REMOTE_CALIBRATION.md.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
 *   MQTT_URL        default mqtt://localhost:1883
 *   MQTT_USERNAME, MQTT_PASSWORD              (optional broker auth)
 *   CMD_TOPIC_PREFIX default 'everspark'      (matches the telemetry topic root)
 *   CMD_POLL_MS      default 2500             (queue poll interval)
 *   CMD_TIMEOUT_MS   default 90000            (no-answer timeout)
 *
 * Requires:  npm install mqtt   (Node 18+, uses global fetch)
 */
const mqtt = require('mqtt');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MQTT_URL     = process.env.MQTT_URL || 'mqtt://localhost:1883';
const PREFIX       = process.env.CMD_TOPIC_PREFIX || 'everspark';
const POLL_MS      = Number(process.env.CMD_POLL_MS || 2500);
const TIMEOUT_MS   = Number(process.env.CMD_TIMEOUT_MS || 90000);
const ACK_TOPIC    = `${PREFIX}/+/cmd/ack`;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

// device_id -> secret_token (cached; tokens are stable).
const tokenCache = new Map();
async function tokenFor(deviceId) {
  if (tokenCache.has(deviceId)) return tokenCache.get(deviceId);
  const res = await sb(`devices?id=eq.${encodeURIComponent(deviceId)}&select=secret_token`);
  const rows = await res.json().catch(() => []);
  const tok = Array.isArray(rows) && rows.length ? rows[0].secret_token : null;
  if (tok) tokenCache.set(deviceId, tok);
  return tok;
}

// Patch one command row. Returns true on success.
async function patchCmd(id, fields) {
  const res = await sb(`device_commands?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) console.error(`[err] patch ${id}: ${await res.text()}`);
  return res.ok;
}

// Devices that currently have a command mid-flight (status 'sent'); the gateway
// answers one at a time, so we don't send a second to the same device.
const inFlight = new Set();

let client;

async function drainQueue() {
  // Reconcile in-flight from the DB each pass (survives restarts / cross-process).
  try {
    const sentRes = await sb(`device_commands?status=eq.sent&select=device_id`);
    const sent = await sentRes.json().catch(() => []);
    inFlight.clear();
    if (Array.isArray(sent)) for (const r of sent) inFlight.add(r.device_id);
  } catch (e) { console.error('inflight scan error:', e.message); }

  let queued = [];
  try {
    const res = await sb(`device_commands?status=eq.queued&order=created_at.asc&select=id,device_id,command`);
    queued = await res.json().catch(() => []);
  } catch (e) { console.error('queue poll error:', e.message); return; }
  if (!Array.isArray(queued) || queued.length === 0) return;

  for (const cmd of queued) {
    if (inFlight.has(cmd.device_id)) continue;   // one per device at a time
    const token = await tokenFor(cmd.device_id);
    if (!token) { await patchCmd(cmd.id, { status: 'error', response: 'unknown device', acked_at: new Date().toISOString() }); continue; }

    const topic = `${PREFIX}/${token}/cmd`;
    const payload = JSON.stringify({ id: cmd.id, line: cmd.command });
    await new Promise((resolve) => client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) console.error(`[err] publish ${topic}: ${err.message}`);
      resolve();
    }));

    const ok = await patchCmd(cmd.id, { status: 'sent', sent_at: new Date().toISOString() });
    if (ok) { inFlight.add(cmd.device_id); console.log(`[sent] ${cmd.command}  ->  ${topic}`); }
  }
}

async function sweepTimeouts() {
  const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString();
  try {
    const res = await sb(`device_commands?status=eq.sent&sent_at=lt.${cutoff}&select=id,device_id`);
    const stale = await res.json().catch(() => []);
    if (!Array.isArray(stale)) return;
    for (const r of stale) {
      await patchCmd(r.id, { status: 'timeout', response: 'no answer from device', acked_at: new Date().toISOString() });
      inFlight.delete(r.device_id);
      console.warn(`[timeout] command ${r.id}`);
    }
  } catch (e) { console.error('timeout sweep error:', e.message); }
}

async function handleAck(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { console.warn(`[skip] bad ack json: ${raw}`); return; }
  if (!msg || !msg.id) { console.warn('[skip] ack without id'); return; }

  const response = typeof msg.response === 'string' ? msg.response : '';
  // Trust an explicit ok flag; otherwise infer from the text (Clara: 'ok -' good,
  // 'error -' / 'busy' bad). 'busy' is left for the device to be re-asked later.
  const low = response.trim().toLowerCase();
  const ok = msg.ok === true || (msg.ok == null && low.startsWith('ok'));
  const status = ok ? 'acked' : 'error';

  // Find the row so we can clear its device from the in-flight set.
  try {
    const res = await sb(`device_commands?id=eq.${encodeURIComponent(msg.id)}&select=device_id,status`);
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) { console.warn(`[skip] ack for unknown command ${msg.id}`); return; }
    if (row.status === 'acked' || row.status === 'error') return;   // duplicate ack
    await patchCmd(msg.id, { status, response, acked_at: new Date().toISOString() });
    inFlight.delete(row.device_id);
    console.log(`[ack:${status}] ${msg.id} <- ${response.split('\n')[0]}`);
  } catch (e) { console.error('ack handling error:', e.message); }
}

client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log(`MQTT connected: ${MQTT_URL}`);
  client.subscribe(ACK_TOPIC, { qos: 1 }, (err) => {
    if (err) console.error('subscribe error:', err.message);
    else console.log(`subscribed: ${ACK_TOPIC}`);
  });
});

client.on('message', (topic, payload) => {
  if (topic.endsWith('/cmd/ack')) handleAck(payload.toString()).catch((e) => console.error('ack error:', e));
});

client.on('error', (e) => console.error('mqtt error:', e.message));
client.on('reconnect', () => console.log('mqtt reconnecting…'));

// Poll the queue + sweep timeouts on a fixed cadence.
setInterval(() => { drainQueue().catch((e) => console.error('drain error:', e)); }, POLL_MS);
setInterval(() => { sweepTimeouts().catch((e) => console.error('sweep error:', e)); }, Math.max(TIMEOUT_MS / 3, 10000));
console.log(`command bridge up — polling every ${POLL_MS}ms, timeout ${TIMEOUT_MS}ms, prefix "${PREFIX}"`);
