/**
 * Ever Spark — standalone HTTP ingest endpoint for SIM800L field nodes.
 *
 * The SIM800L can only speak plain HTTP (no TLS), and HTTPS-only hosts like
 * Vercel reject it. Run THIS on any always-on host (a free Oracle Cloud VM, a
 * cheap VPS, etc.) so the hardware can POST directly over HTTP. It writes
 * straight into the SAME Supabase database your dashboard reads — no relay,
 * no tunnel.
 *
 * Zero dependencies. Requires Node 18+ (uses the built-in global fetch).
 *
 * Run:
 *   SUPABASE_URL="https://xxxx.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
 *   PORT=8080 node server.js
 *
 * Hardware POST (form-urlencoded):
 *   token=<secret_token>&data=;P1,P2,P3,P4,P5,P6,P7,P8,P9:
 */
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT         = Number(process.env.PORT || 8080);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

// Parse the 9-parameter Clara frame: ;P1,...,P9:
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

const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET') {
    return send(200, { service: 'Ever Spark HTTP ingest', status: 'healthy' });
  }
  if (req.method !== 'POST') return send(405, { error: 'POST only' });

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', async () => {
    try {
      const params = new URLSearchParams(body);
      const token = params.get('token');
      const data = params.get('data');
      if (!token || !data) return send(400, { error: 'Missing token or data' });

      const frame = parseFrame(data);
      if (!frame) return send(422, { error: 'Bad frame. Expected ;P1,..,P9:' });

      const devRes = await sb(`devices?secret_token=eq.${encodeURIComponent(token)}&select=id,name`);
      const devs = await devRes.json();
      if (!Array.isArray(devs) || devs.length === 0) {
        return send(404, { error: 'Unknown token — device not registered' });
      }
      const device = devs[0];
      const ts = new Date().toISOString();

      const ins = await sb('telemetry_data', {
        method: 'POST',
        body: JSON.stringify({ device_id: device.id, ...frame, timestamp: ts }),
      });
      if (!ins.ok) return send(500, { error: `insert failed: ${await ins.text()}` });

      await sb(`devices?id=eq.${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'online', last_seen: ts }),
      });

      console.log(`[${ts}] ${device.name} <- ${data}`);
      send(200, { status: 'ok', device: device.name, received_at: ts });
    } catch (e) {
      send(500, { error: String(e) });
    }
  });
});

server.listen(PORT, () => console.log(`Ever Spark ingest listening on :${PORT}`));
