/**
 * Ever Spark — remote-calibration command bridge (for a TRANSPARENT USR-G771).
 *
 * The site gateway is a transparent 4G DTU: it bridges MQTT <-> RS485 verbatim,
 * with no logic of its own. So this bridge speaks Clara's console directly:
 *
 *   Downlink:  publish the BARE command line + '\n' to  everspark/<token>/cmd
 *              -> the modem writes those bytes to RS485 -> Clara executes it.
 *   Uplink:    Clara's answer goes out on RS485 -> the modem republishes it on
 *              the TELEMETRY topic  everspark/<token>  as a line that does NOT
 *              start with ';'. We listen there and treat that text as the answer.
 *
 * Only ONE command per device is in flight, so a non-';' line from a device with
 * a 'sent' command is unambiguously that command's answer. Multi-line answers
 * (e.g. `get`) may arrive as one or a few MQTT messages; we accumulate until the
 * line goes quiet (ANSWER_IDLE_MS) or the next telemetry frame arrives.
 *
 * Runs on the EC2 VM next to mqtt-subscriber.js, which it leaves untouched (that
 * one keeps ingesting ';...:' frames; this one only reads the non-';' answers).
 *
 * USR-G771 config (once per modem): keep the publish topic everspark/<token>,
 * and add a SUBSCRIBE topic everspark/<token>/cmd whose payload is written to the
 * serial port. Clara must be in remote mode (auto ~2 min after boot; remote_cal=1).
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
 *   MQTT_URL        default mqtt://localhost:1883
 *   MQTT_USERNAME, MQTT_PASSWORD              (optional broker auth)
 *   CMD_TOPIC_PREFIX default 'everspark'      (telemetry topic root)
 *   CMD_POLL_MS      default 2500             (queue poll interval)
 *   CMD_TIMEOUT_MS   default 90000            (no-answer timeout)
 *   ANSWER_IDLE_MS   default 2500             (quiet gap that ends an answer)
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
const IDLE_MS      = Number(process.env.ANSWER_IDLE_MS || 2500);

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

// device_id <-> secret_token (tokens are stable).
const tokenByDevice = new Map();
const deviceByToken = new Map();
async function tokenFor(deviceId) {
  if (tokenByDevice.has(deviceId)) return tokenByDevice.get(deviceId);
  const res = await sb(`devices?id=eq.${encodeURIComponent(deviceId)}&select=secret_token`);
  const rows = await res.json().catch(() => []);
  const tok = Array.isArray(rows) && rows.length ? rows[0].secret_token : null;
  if (tok) { tokenByDevice.set(deviceId, tok); deviceByToken.set(tok, deviceId); }
  return tok;
}

async function patchCmd(id, fields) {
  const res = await sb(`device_commands?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) console.error(`[err] patch ${id}: ${await res.text()}`);
  return res.ok;
}

// device_id -> { commandId, buffer: string[], timer }. Presence = one in flight.
const inFlight = new Map();

let client;

function finalize(deviceId) {
  const e = inFlight.get(deviceId);
  if (!e) return;
  if (e.timer) clearTimeout(e.timer);
  const response = e.buffer.join('\n').trim();
  const low = response.toLowerCase();
  const isError = low === '' || low.startsWith('error') || low.startsWith('busy');
  inFlight.delete(deviceId);
  patchCmd(e.commandId, {
    status: isError ? 'error' : 'acked',
    response: response || 'empty answer',
    acked_at: new Date().toISOString(),
  }).then(() => console.log(`[ack:${isError ? 'error' : 'ok'}] ${e.commandId} <- ${response.split('\n')[0] || '(empty)'}`));
}

// A non-';' line arrived for a device with a command in flight: it's the answer.
function onAnswerText(deviceId, text) {
  const e = inFlight.get(deviceId);
  if (!e) return;
  for (const ln of text.split(/\r?\n/)) { const t = ln.trim(); if (t) e.buffer.push(t); }
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => finalize(deviceId), IDLE_MS);
}

async function drainQueue() {
  let queued = [];
  try {
    const res = await sb(`device_commands?status=eq.queued&order=created_at.asc&select=id,device_id,command`);
    queued = await res.json().catch(() => []);
  } catch (e) { console.error('queue poll error:', e.message); return; }
  if (!Array.isArray(queued) || queued.length === 0) return;

  for (const cmd of queued) {
    if (inFlight.has(cmd.device_id)) continue;             // one per device at a time
    const token = await tokenFor(cmd.device_id);
    if (!token) { await patchCmd(cmd.id, { status: 'error', response: 'unknown device', acked_at: new Date().toISOString() }); continue; }

    const topic = `${PREFIX}/${token}/cmd`;
    const payload = `${cmd.command}\n`;                    // BARE line — modem writes it to RS485 verbatim
    await new Promise((resolve) => client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) console.error(`[err] publish ${topic}: ${err.message}`);
      resolve();
    }));

    const ok = await patchCmd(cmd.id, { status: 'sent', sent_at: new Date().toISOString() });
    if (ok) {
      inFlight.set(cmd.device_id, { commandId: cmd.id, buffer: [], timer: null });
      console.log(`[sent] ${cmd.command}  ->  ${topic}`);
    }
  }
}

async function sweepTimeouts() {
  const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString();
  try {
    const res = await sb(`device_commands?status=eq.sent&sent_at=lt.${cutoff}&select=id,device_id`);
    const stale = await res.json().catch(() => []);
    if (!Array.isArray(stale)) return;
    for (const r of stale) {
      const e = inFlight.get(r.device_id);
      if (e?.timer) clearTimeout(e.timer);
      inFlight.delete(r.device_id);
      await patchCmd(r.id, { status: 'timeout', response: 'no answer from device', acked_at: new Date().toISOString() });
      console.warn(`[timeout] command ${r.id}`);
    }
  } catch (e) { console.error('timeout sweep error:', e.message); }
}

// On startup, treat any rows already 'sent' as in flight (so we don't re-send and
// can still match a late answer), resolving their tokens for the uplink lookup.
async function reconcile() {
  try {
    const res = await sb(`device_commands?status=eq.sent&select=id,device_id`);
    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows)) for (const r of rows) {
      await tokenFor(r.device_id);
      if (!inFlight.has(r.device_id)) inFlight.set(r.device_id, { commandId: r.id, buffer: [], timer: null });
    }
  } catch (e) { console.error('reconcile error:', e.message); }
}

client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log(`MQTT connected: ${MQTT_URL}`);
  // Telemetry topic everspark/<token> — same level as the subscriber. We only
  // read the non-';' lines (answers); ';...:' frames are the subscriber's job.
  client.subscribe(`${PREFIX}/+`, { qos: 1 }, (err) => {
    if (err) console.error('subscribe error:', err.message);
    else console.log(`subscribed: ${PREFIX}/+ (reading command answers)`);
  });
  reconcile();
});

client.on('message', (topic, payload) => {
  const parts = topic.split('/');
  if (parts.length !== 2 || parts[0] !== PREFIX) return;  // only everspark/<token>
  const deviceId = deviceByToken.get(parts[1]);
  if (!deviceId || !inFlight.has(deviceId)) return;        // not awaiting an answer
  const text = payload.toString();
  if (text.trim().startsWith(';')) { if (inFlight.get(deviceId).buffer.length) finalize(deviceId); return; }
  onAnswerText(deviceId, text);
});

client.on('error', (e) => console.error('mqtt error:', e.message));
client.on('reconnect', () => console.log('mqtt reconnecting…'));

setInterval(() => { drainQueue().catch((e) => console.error('drain error:', e)); }, POLL_MS);
setInterval(() => { sweepTimeouts().catch((e) => console.error('sweep error:', e)); }, Math.max(TIMEOUT_MS / 3, 10000));
console.log(`command bridge up — transparent-DTU mode, poll ${POLL_MS}ms, answer-idle ${IDLE_MS}ms, timeout ${TIMEOUT_MS}ms, prefix "${PREFIX}"`);
