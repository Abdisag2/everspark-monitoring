/**
 * Ever Spark — MQTT ingest for PUSR USR-G771 (and any MQTT field node).
 *
 * Subscribes to  everspark/<secret_token>  on an MQTT broker (Mosquitto on this
 * same VM), parses the 9-parameter Clara frame from the payload, and writes to
 * the SAME Supabase database as the HTTP ingest — reusing the exact device
 * tokens and telemetry/alarm logic. No dashboard changes required.
 *
 *   Device publishes:  topic  everspark/<token>   payload  ;P1,P2,..,P9:
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
 *   MQTT_URL        default mqtt://localhost:1883
 *   MQTT_USERNAME, MQTT_PASSWORD              (optional broker auth)
 *   MQTT_TOPIC      default everspark/+
 *
 * Requires:  npm install mqtt   (Node 18+)
 */
const mqtt = require('mqtt');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MQTT_URL     = process.env.MQTT_URL || 'mqtt://localhost:1883';
const TOPIC        = process.env.MQTT_TOPIC || 'everspark/+';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

function parseFrame(raw) {
  const s = (raw || '').trim();
  if (!s.startsWith(';') || !s.endsWith(':')) return null;
  const p = s.slice(1, -1).split(',').map(Number);
  if (p.length !== 9 || p.some(Number.isNaN)) return null;
  const bit = (n) => (n >= 0.5 ? 1 : 0);
  return {
    flow_rate: p[0], voltage: p[1],
    level_sensor_1: bit(p[2]), level_sensor_2: bit(p[3]), level_sensor_3: bit(p[4]),
    naclo_pumped: p[5], target_frc: p[6], active_chlorine: p[7], ph_value: p[8],
  };
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

async function ingest(token, payload) {
  const frame = parseFrame(payload);
  if (!frame) { console.warn(`[skip] bad frame for ${token}: ${payload}`); return; }

  const devRes = await sb(`devices?secret_token=eq.${encodeURIComponent(token)}&select=id,name`);
  const devs = await devRes.json().catch(() => []);
  if (!Array.isArray(devs) || devs.length === 0) { console.warn(`[skip] unknown token: ${token}`); return; }

  const device = devs[0];
  const ts = new Date().toISOString();

  const prevRes = await sb(`telemetry_data?device_id=eq.${device.id}&order=timestamp.desc&limit=1&select=level_sensor_1`);
  const prevArr = await prevRes.json().catch(() => []);
  const prevL1 = Array.isArray(prevArr) && prevArr.length ? Number(prevArr[0].level_sensor_1) : null;

  const ins = await sb('telemetry_data', {
    method: 'POST',
    body: JSON.stringify({ device_id: device.id, ...frame, timestamp: ts }),
  });
  if (!ins.ok) { console.error(`[err] insert failed: ${await ins.text()}`); return; }

  await sb(`devices?id=eq.${device.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'online', last_seen: ts }),
  });

  const raise = (alarm_type, message) =>
    sb('alarms', { method: 'POST', body: JSON.stringify({ device_id: device.id, alarm_type, message, timestamp: ts }) });

  if (prevL1 === 1 && frame.level_sensor_1 === 0 && frame.level_sensor_2 === 0) {
    await raise('production_complete', 'Chlorine production is completed. Please start a new production.');
  }
  if (frame.level_sensor_3 === 1) {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const recentRes = await sb(`alarms?device_id=eq.${device.id}&alarm_type=eq.no_naclo&acknowledged=eq.false&timestamp=gte.${since}&select=id&limit=1`);
    const recent = await recentRes.json().catch(() => []);
    if (!Array.isArray(recent) || recent.length === 0) {
      await raise('no_naclo', 'There is no Chlorine in the Clara system. Please immediately start a new production.');
    }
  }

  console.log(`[${ts}] ${device.name} <- ${payload}`);
}

const client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log(`MQTT connected: ${MQTT_URL}`);
  client.subscribe(TOPIC, (err) => {
    if (err) console.error('subscribe error:', err.message);
    else console.log(`subscribed: ${TOPIC}`);
  });
});

client.on('message', (topic, payload) => {
  // topic shape: everspark/<token>  → token is the last segment
  const token = topic.split('/').pop();
  ingest(token, payload.toString()).catch((e) => console.error('ingest error:', e));
});

client.on('error', (e) => console.error('mqtt error:', e.message));
client.on('reconnect', () => console.log('mqtt reconnecting…'));
