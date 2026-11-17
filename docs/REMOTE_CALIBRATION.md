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
                                  │  (status=sent)             clara/<token>/cmd         to RS485
                                  │                                                           │
                                  │                                                      read answer line
                                  │                                                      (does NOT start ';')
                                  ◀── write response ◀──────── recv MQTT   ◀───────────── publish answer ◀──┘
                                     (status=acked/error)      clara/<token>/cmd/ack
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

Add to the existing EC2 service (same box, same Supabase service-role client and
MQTT client already used for telemetry):

**Downlink — send queued commands**
1. Find work: either Supabase Realtime on `device_commands` INSERT, or poll
   `select * from device_commands where status='queued' order by created_at limit N`.
2. For each, look up the device's `secret_token`, then publish to the device's
   command topic (below). Set `status='sent'`, `sent_at=now()`.
3. Keep one command in flight per device (Clara answers one line at a time and
   replies `busy` to a second). Hold the next `queued` row for that device until the
   current one is `acked`/`error`/`timeout`.

**Uplink — record answers**
4. Subscribe to the ack topic. On a message, match by `id`, write `response`, set
   `status` from the answer: starts with `ok` → `acked`; `busy` → leave `sent` and
   retry a few seconds later; anything else (incl. `error - ...`) → `error`.
   Set `acked_at=now()`.

**Timeout sweep**
5. Any row `sent` with no answer after e.g. 90 s → `status='timeout'`,
   `response='no answer from device'`. (Clara only listens in REMOTE mode — see §4.)

---

## 3. MQTT topics & payloads

Key the topics on the device's `secret_token` (the same identifier the HTTP ingest
uses). **Mirror whatever topic scheme the gateway already uses for telemetry** — the
names below are the contract, adjust the prefix to match your broker.

**Downlink** — EC2 → gateway, topic `clara/<secret_token>/cmd`, QoS 1:
```json
{ "id": "7b3f…uuid", "line": "set report_interval 60" }
```

**Uplink** — gateway → EC2, topic `clara/<secret_token>/cmd/ack`, QoS 1:
```json
{ "id": "7b3f…uuid", "response": "ok - 4  report_interval = 60 s  [5 .. 3600]  Ecophi report period", "ok": true }
```
`ok` is a convenience; EC2 can also derive it from the text. Echo back the same `id`
so retries/duplicates map to one row.

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
