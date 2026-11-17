# Remote calibration — integration contract

How an operator changes a Clara setting from the dashboard and gets the device's
answer back. v1 scope: **read the current config + set safe main-board
parameters.** Dosing / chlorine calibration (target_frc, pump & flow-meter cal) is
deferred to a later, extra-guarded phase.

```
 Dashboard (Vercel)           Supabase                 EC2 bridge              Site gateway            Clara main board
 ─────────────────            ────────                 ──────────              ────────────            ───────────────
 operator clicks  ──RPC──▶  device_commands                                                             (REMOTE mode,
 "Read config" /            row: status=queued                                                           RS485 RX on)
 "Save"                           │                                                                          ▲
                                  │  claim queued  ──────────▶ publish MQTT  ──────────▶ write "<cmd>\n"  ──┘
                                  │  (status=sent)         everspark/<token>/cmd         to RS485
                                  │                                                           │
                                  │                                                      read answer line
                                  │                                                      (does NOT start ';')
                                  ◀── write response ◀──────── recv MQTT   ◀───────────── publish answer ◀──┘
                                     (status=acked/error)   everspark/<token>/cmd/ack
 UI polls the row  ◀──────────────┘
 and shows the answer
```

The dashboard never touches MQTT. It only calls the `queue_device_command` RPC and
reads the row back. Everything between Supabase and the RS485 bus is the **EC2
bridge** (which already moves telemetry MQTT → Supabase) plus the **site gateway**
firmware (the unit on the other end of Clara's RS485 line).

---

## 1. The command queue (already created)

`supabase/migrations/2026-11-17_remote_calibration.sql` adds `public.device_commands`:

| column | meaning |
|---|---|
| `id` | uuid, the command id used on MQTT |
| `device_id`, `organization_id` | target device + its org |
| `command` | the exact console line, e.g. `set report_interval 60` |
| `kind` | `read` or `write` |
| `status` | `queued` → `sent` → `acked` \| `error` \| `timeout` \| `canceled` |
| `response` | Clara's text answer, or an EC2 transport note |
| `issued_by`, `issued_role`, `created_at`, `sent_at`, `acked_at` | audit |

The app inserts **only** through `queue_device_command(device, cmd)`, which enforces
the role (admin or the device-org's manager) and the v1 allowlist. The EC2 bridge
uses the **service-role key** (bypasses RLS) for everything below.

---

## 2. EC2 bridge responsibilities

This is implemented in **`hardware-ingest/command-bridge.js`** (zero deps beyond
`mqtt`, same style as `mqtt-subscriber.js`) — run it on the EC2 VM alongside the
telemetry subscriber. It:

1. Polls `device_commands where status='queued'`, resolves each device's
   `secret_token`, publishes to the command topic (below), and marks the row
   `sent`. One command in flight per device (Clara answers one line at a time).
2. Subscribes to the ack topic; on a message, matches by `id`, writes `response`,
   and sets `status` — `acked` when the gateway reports `ok` (or the text starts
   with `ok`), otherwise `error`.
3. Sweeps rows stuck in `sent` past `CMD_TIMEOUT_MS` (default 90 s) to `timeout`.

Env (reuses the telemetry subscriber's, plus a few): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `MQTT_URL`, `MQTT_USERNAME`/`MQTT_PASSWORD`,
`CMD_TOPIC_PREFIX` (default `everspark`), `CMD_POLL_MS` (2500), `CMD_TIMEOUT_MS`
(90000). Deploy as a systemd service (e.g. `everspark-cmd`) next to
`everspark-ingest` / `everspark-mqtt`.

---

## 3. MQTT topics & payloads

Keyed on the device's `secret_token` — the same identifier the telemetry topic
`everspark/<secret_token>` already uses. The command topics hang off it:

**Downlink** — bridge → gateway, topic `everspark/<secret_token>/cmd`, QoS 1:
```json
{ "id": "7b3f…uuid", "line": "set report_interval 60" }
```

**Uplink** — gateway → bridge, topic `everspark/<secret_token>/cmd/ack`, QoS 1:
```json
{ "id": "7b3f…uuid", "response": "ok - 4  report_interval = 60 s  [5 .. 3600]  Ecophi report period", "ok": true }
```
`ok` is optional — the bridge infers it from the text when absent. Echo back the
same `id` so retries/duplicates map to one row. (Change the `everspark` root only if
your broker uses a different one — set `CMD_TOPIC_PREFIX` to match.)

---

## 4. Site gateway responsibilities (the RS485 end)

The gateway is the unit on the other side of Clara's RS485 line. For each downlink
message:

1. **Make sure Clara is listening.** Clara only accepts RS485 commands in REMOTE
   mode. A deployed unit with nobody on USB enters REMOTE automatically ~2 min after
   boot and stays there. (Firmware param `remote_cal=1`; `remote_cal=0` disables it —
   which is why the app refuses to set that param.)
2. **Respect half-duplex.** RS485 is one wire pair. Only transmit when Clara is not
   transmitting — send between telemetry frames, and don't talk over an answer.
3. **Send** `line` followed by `\n`.
4. **Read the answer.** Clara's console reply is one or more text lines that **never
   start with `;`** (telemetry frames always start with `;` and end with `:`). Collect
   the non-`;` line(s) that follow your command until the line goes idle (~0.3 s is
   typical; some commands like `pumpcal` stream progress — not in v1). Join them into
   `response`.
5. **Publish** the ack. If Clara answered `busy`, publish that verbatim (EC2 retries).
   If nothing came back, either publish nothing (EC2's timeout handles it) or an
   `{"id":…, "ok":false, "response":"no answer"}`.

> Unknown lines and bus noise get no answer from Clara by design, so a dropped or
> garbled command simply times out — it never half-applies.

---

## 5. v1 command allowlist (enforced in `queue_device_command`)

**Reads (always allowed):** `get`, `get <name|#>`, `status`, `i2c`, `report`,
`dosing get`, `dosing get <name|#>`.

**Writes (v1):** `set <name> <value>` for these main-board params only —
`production_min`, `settling_min`, `transfer_min`, `polarity_cycles`,
`report_interval`, `level_debounce`, `voltage_ref`, `voltage_divider`,
`resume_batch`, `checkpoint_min`, `water_ph`, `active_cl`, `usb_window_min`,
`usb_idle_min`.

**Deliberately rejected in v1:** `report_baud` and `remote_cal` (self-lockout risk),
and all dosing/chlorine writes (`dosing set`, `pumpcal`, `dose`, `flowcal`,
`flowsim`, `defaults`, `force`, …). These come in a later phase behind a second
confirmation.
