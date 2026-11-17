/**
 * SMS delivery via smsethiopia.com (API v1).
 *
 * AWS SNS cannot deliver A2P SMS to Ethiopian networks, so alarm SMS go through
 * smsethiopia — a local, Ethio Telecom-approved gateway. The Sender ID (EVERSPARK)
 * is bound to the API key's campaign on their side, so it is NOT sent per message.
 *
 * Docs: https://smsethiopia.com/#/landing/docs/api-v1
 *   POST https://smsethiopia.com/api/sms/send
 *   Header: KEY: <api key>
 *   Body:   { "msisdn": "2519XXXXXXXX", "text": "..." }   // msisdn = 12 digits, no '+'
 *   OK:     200 { "sent": true, "description": "Accepted for delivery" }
 */

const SEND_URL = 'https://smsethiopia.com/api/sms/send';

/**
 * Normalise a phone number to smsethiopia's msisdn format: 12 digits starting 2519,
 * no '+'. Accepts the stored E.164 form (+2519XXXXXXXX), a local 09XXXXXXXX, or a
 * bare 9XXXXXXXX. Returns null if it is not a valid Ethiopian mobile number.
 */
export function toEthiopianMsisdn(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');            // strip '+', spaces, dashes
  if (d.length === 10 && d.startsWith('09')) d = '251' + d.slice(1); // 09XXXXXXXX -> 2519XXXXXXXX
  else if (d.length === 9 && d.startsWith('9')) d = '251' + d;       // 9XXXXXXXX  -> 2519XXXXXXXX
  return /^2519\d{8}$/.test(d) ? d : null;
}

/** Send one SMS. Never throws — returns {ok,false,error} so the caller can collect failures. */
export async function sendSmsEthiopia(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.SMSETHIOPIA_API_KEY;
  if (!apiKey) return { ok: false, error: 'SMSETHIOPIA_API_KEY not set' };

  const msisdn = toEthiopianMsisdn(phone);
  if (!msisdn) return { ok: false, error: `invalid Ethiopian number: ${phone}` };

  try {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { KEY: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msisdn, text }),
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* gateway returned non-JSON */ }

    if (res.status === 429) return { ok: false, error: 'rate limited (429) — retry later' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${data?.description || data?.message || ''}`.trim() };
    if (data && data.sent === false) return { ok: false, error: data.description || 'gateway rejected the message' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
