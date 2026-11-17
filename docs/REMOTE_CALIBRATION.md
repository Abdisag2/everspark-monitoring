# Remote calibration — integration contract

How an operator changes a Clara setting from the dashboard and gets the device's
answer back. v1 scope: **read the current config + set safe main-board
parameters.** Dosing / chlorine calibration (target_frc, pump & flow-meter cal) is
deferred to a later, extra-guarded phase.

```
 Dashboard (Vercel)         Supabase            EC2 bridge           USR-G771 (transparent)     Clara main board
 ─────────────────          ────────            ──────────           ──────────────────────     ───────────────
 operator clicks  ─RPC─▶  device_commands                                                        (REMOTE mode,
 "Read config"/"Save"     row: queued                                                             RS485 RX on)
                               │  publish "set …\n"  ─────────▶  subscribe .../cmd ─▶ RS485 TX  ──▶ executes
                               │  everspark/<token>/cmd          (writes bytes verbatim)             │
                               │  (row: sent)                                                   RS485 TX answer
                               │                                                                     │
                               ◀─ non-';' line = answer ◀── everspark/<token> ◀── RS485 RX ◀────────┘
                                  (row: acked/error)        (modem republishes serial)
 UI polls the row ◀────────────┘
 and shows the answer
```

The dashboard never touches MQTT — it calls the `queue_device_command` RPC and reads
the row back. The **EC2 bridge** (`command-bridge.js`) does the rest. The site gateway
is a **transparent USR-G771**: it has no logic, it just copies MQTT⇄RS485 both ways,
so the bridge speaks Clara's console protocol directly and reads the answer off the
same telemetry topic the modem already publishes on.

---

## 1. The command queue (already created)

`supabase/migrations/2026-11-17_remote_calibration.sql` adds `public.device_commands`:

| column | meaning |
|---|---|
| `id` | uuid, primary key / audit id |
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
telemetry subscriber, which it leaves untouched. It:

1. Polls `device_commands where status='queued'`, resolves each device's
   `secret_token`, and publishes the **bare command line + `\n`** to
   `everspark/<token>/cmd`, then marks the row `sent`. One command in flight per
   device (Clara answers one line at a time).
2. Subscribes to the telemetry topic `everspark/+` and reads the **non-`;` lines**
   (the `;…:` frames stay the subscriber's job). While a device has a command in
   flight, it accumulates that device's non-`;` text as the answer and finalizes it
   when the line goes quiet (`ANSWER_IDLE_MS`, default 2.5 s) or the next telemetry
   frame arrives — writing `response` and `status` (`error` if the answer starts
   with `error`/`busy` or is empty, else `acked`).
3. Sweeps rows stuck in `sent` past `CMD_TIMEOUT_MS` (default 90 s) to `timeout`.

Env (reuses the telemetry subscriber's, plus a few): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `MQTT_URL`, `MQTT_USERNAME`/`MQTT_PASSWORD`,
`CMD_TOPIC_PREFIX` (default `everspark`), `CMD_POLL_MS` (2500), `CMD_TIMEOUT_MS`
(90000), `ANSWER_IDLE_MS` (2500). Deploy as a systemd service (`everspark-cmd`) next
to `everspark-ingest` / `everspark-mqtt`.

---

## 3. MQTT topics & payloads

Keyed on the device's `secret_token` — the same identifier the telemetry topic
`everspark/<secret_token>` already uses.

**Downlink** — bridge → modem, topic `everspark/<secret_token>/cmd`, QoS 1. Payload
is the **raw console line plus a newline**, nothing else (the transparent modem
writes these exact bytes to RS485):
```
set report_interval 60\n
```

**Uplink** — there is **no dedicated ack topic**. Clara's answer leaves on RS485 and
the modem republishes it on its normal publish topic `everspark/<secret_token>`, as
one or more lines that do **not** start with `;`. The bridge reads them there:
```
ok - 4  report_interval = 60 s  [5 .. 3600]  Ecophi report period
```
Because only one command is in flight per device, that text is unambiguously the
answer. (Change the `everspark` root only if your broker uses a different one — set
`CMD_TOPIC_PREFIX` to match.)

---

## 4. USR-G771 modem configuration (one-time, per modem)

The modem already **publishes** Clara's serial output to `everspark/<token>`. Add a
**subscribe** topic so downlink commands reach the serial port — in transparent/MQTT
mode, set the subscribe topic to `everspark/<token>/cmd` (its payload is written to
RS485 verbatim). Keep 115200 baud and the existing publish topic. No other change.

Then it just works, given two field conditions:

1. **Clara must be in REMOTE mode** to accept RS485 commands. A deployed unit with
   nobody on USB enters REMOTE automatically ~2 min after boot and stays there
   (`remote_cal=1`; `remote_cal=0` disables it — which is why the app refuses to set
   that param). If a technician opens the USB console on site, remote commands pause
   until the USB session goes idle (`usb_idle_min`).
2. **Half-duplex timing.** RS485 is one pair; a command and a telemetry frame must
   not overlap. Commands are rare and Clara's frames are brief, so a clash is
   unlikely — and if one is garbled, Clara simply ignores it (unknown lines get no
   answer) and the bridge times the command out. It never half-applies.

> Multi-line answers (e.g. `get`, ~16 lines) may arrive as one or a few MQTT
> messages depending on the modem's serial-packing time. The bridge stitches them
> back together, so set a generous packing time (e.g. 100–500 ms) if `get` answers
> arrive split.

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
