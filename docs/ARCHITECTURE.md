# Architecture & Project Structure

Ever Spark Monitoring is a multi-tenant IoT dashboard for **Clara** chlorine-production
field nodes. It ingests 9-parameter telemetry frames from cellular hardware and
presents them on a role-based, real-time web dashboard.

---

## 1. High-level architecture

```
                         ┌──────────────────────────────────────────┐
   FIELD HARDWARE        │                 CLOUD                     │       USERS
 ┌───────────────┐       │                                          │   ┌──────────────┐
 │ Arduino +     │       │   ┌───────────────┐                      │   │  Browser     │
 │ SIM800L (2G)  │──HTTP─┼──▶│ EC2 ingest    │──┐                   │   │  (Next.js    │
 └───────────────┘       │   │ server.js     │  │                   │   │   dashboard) │
                         │   │  :8080 (HTTP) │  │   ┌────────────┐  │   └──────┬───────┘
 ┌───────────────┐       │   ├───────────────┤  ├──▶│  Supabase  │◀─┼──────────┘  (HTTPS)
 │ Arduino +     │       │   │ MQTT sub      │  │   │  Postgres  │  │   reads telemetry,
 │ USR-G771 (4G) │──MQTT─┼──▶│ + Mosquitto   │──┘   │  + Auth    │  │   devices, alarms
 └───────────────┘       │   │  :1883        │      │  + RLS     │  │   (RLS-scoped)
                         │   └───────────────┘      └────────────┘  │
                         │                                ▲         │
                         │   Vercel (Next.js)  /api/ingest │         │
                         │   /api/invite ─────────────────┘         │
                         └──────────────────────────────────────────┘
```

Three independent ingest paths all write to the **same Supabase database**; the
dashboard reads from it. Adding a transport never requires dashboard changes.

### Why the hardware can't talk to Vercel directly
- **SIM800L** has no usable TLS stack → can only do plain HTTP. **Vercel is
  HTTPS-only** (plain HTTP gets a 307 redirect the module can't follow).
- **USR-G771** is a 4G modem with a native MQTT engine, but again points at a
  broker, not an HTTPS web app.

So a small always-on host (an **AWS EC2 free-tier VM**) terminates the
device-friendly protocols (HTTP on :8080, MQTT on :1883) and writes straight to
Supabase via the **service-role key**. See [HARDWARE.md](./HARDWARE.md).

---

## 2. Data model (Supabase / PostgreSQL)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `organizations` | Tenants (client enterprises) | `id`, `name`, `created_at` |
| `profiles` | App users (1-1 with `auth.users`) | `id`, `organization_id`, `email`, `role`, `is_active` |
| `devices` | Registered field nodes | `id`, `organization_id`, `name`, `secret_token` (unique), `status`, `last_seen` |
| `telemetry_data` | 9-param frames | `device_id`, `flow_rate`, `voltage`, `level_sensor_1..3`, `naclo_pumped`, `target_frc`, `active_chlorine`, `ph_value`, `timestamp` |
| `alarms` | Server-raised events | `device_id`, `alarm_type` (`production_complete` \| `no_naclo`), `message`, `acknowledged`, `timestamp` |

**Telemetry wire frame** (the device payload):
```
;P1,P2,P3,P4,P5,P6,P7,P8,P9:
 │  │  │  │  │  │  │  │  └─ pH
 │  │  │  │  │  │  │  └──── active chlorine (mg/L)
 │  │  │  │  │  │  └─────── target FRC (mg/L)
 │  │  │  │  │  └────────── NaClO pumped (L)
 │  │  │  │  └───────────── level sensor 3 (0|1, 1 = NaClO depleted)
 │  │  │  └──────────────── level sensor 2 (0|1)
 │  │  └─────────────────── level sensor 1 (0|1, 1 = in-production)
 │  └────────────────────── voltage (V)
 └───────────────────────── flow rate (L/min)
```
Example: `;35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:`

### Multi-tenancy via Row-Level Security
Every table has RLS policies (in [`supabase/schema.sql`](../supabase/schema.sql)):
- **Admin** (`profiles.role = 'admin'`, `organization_id = null`) → full access to all rows.
- **Manager / Viewer** → may only `SELECT` rows where the record's
  `organization_id` equals their own. Managers can additionally CRUD devices/members
  **within their org** and may never elevate anyone to `admin`.
- Helper functions `is_admin()`, `current_org()`, `current_role()` are
  `SECURITY DEFINER` to avoid recursive RLS on `profiles`.
- Ingest writes use the **service-role key** (bypasses RLS) — there is no anon
  insert policy on `telemetry_data`/`alarms` on purpose.

### Alarm engine (server-side)
On each frame the ingest checks the previous frame and raises:
- `production_complete` — level 1 transitions `1 → 0` while level 2 = 0.
- `no_naclo` — level 3 = 1 (debounced: one open alarm per device per hour).

---

## 3. Frontend architecture

- **Next.js 14 App Router**, all dashboard UI is client-rendered under a single
  React context (`context/AppContext.tsx`).
- **`AppContext`** is the heart: it holds auth state, the data arrays
  (orgs/devices/profiles/telemetry/alarms), and exposes RLS-mimicking scoped
  selectors (`getVisibleDevices`, `getVisibleProfiles`, …).
  - **Demo mode** (no Supabase env): seeds from `lib/mock-data.ts`, fully
    interactive in-memory.
  - **Live mode** (Supabase configured): loads from Supabase, polls every 8 s,
    and writes CRUD through to the DB. Same components, real data.
- **Auth:** `lib/supabase.ts` exposes the browser client + a server admin client.
  Login uses real Supabase Auth when configured, else a mock that authenticates
  against the seed profiles (`DEMO_PASSWORD`).
- **Role-based UI:** the sidebar (`lib/nav.ts`) and panels switch on
  `currentUser.role`. An admin-only **"Preview as"** bar (`RoleSwitcher`) lets an
  admin impersonate a manager/viewer view.

### Render flow
```
app/layout.tsx  → wraps everything in <AppProvider>
app/page.tsx    → forwards to /dashboard (or /welcome if an auth token is in the URL hash)
app/login/page  → sign in / forgot-password / reset
app/welcome     → invited user sets their password
app/dashboard   → mounted+auth gate, then renders a panel based on panelState.view
```

---

## 4. Directory structure

```
everspark-monitoring/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── ingest/route.ts       # HTTP telemetry endpoint (Vercel) — parses frame, writes Supabase, raises alarms
│   │   └── invite/route.ts       # Email-invite endpoint (Supabase admin, JWT-verified, RBAC)
│   ├── dashboard/page.tsx        # Auth-gated shell + panel router
│   ├── login/page.tsx            # Sign-in + forgot/reset password
│   ├── welcome/page.tsx          # Invitation accept / set password
│   ├── page.tsx                  # Entry → forwards to dashboard or /welcome
│   ├── layout.tsx                # Root layout + <AppProvider>
│   └── globals.css               # Theme tokens, components, animations
│
├── components/
│   ├── admin/                    # AdminDashboard, OrganizationManagement, DeviceConfiguration,
│   │                             #   MemberDirectory, SimulationEngine
│   ├── manager/                  # ManagerDashboard, OrgSettings
│   ├── viewer/                   # DeviceList (live monitoring), DeviceDetail (charts + raw + CSV)
│   ├── charts/TelemetryCharts.tsx# Flow / Production / Voltage / Chlorine+pH (Recharts)
│   ├── layout/                   # Sidebar, Header, RoleSwitcher
│   ├── brand/EverSparkLogo.tsx   # Inline SVG logo
│   └── shared/                   # MetricCard, Modal, ConfirmDialog, CopyButton, StatusBadge,
│                                 #   TimeRangePicker, LiveHardwareFeed, PanelPlaceholder
│
├── context/AppContext.tsx        # Global state, auth, live Supabase sync, scoped selectors
│
├── lib/
│   ├── supabase.ts               # Browser client + server admin client + mock query builder
│   ├── types.ts                  # Domain types + PARAMETER_META
│   ├── mock-data.ts              # Seed data for demo mode
│   ├── nav.ts                    # Role-based sidebar config
│   ├── utils.ts                  # cn(), token gen, frame parse/build, time helpers
│   ├── timeRanges.ts             # Time-range options + start-of-window math
│   └── useMounted.ts             # SSR-safe mount gate (avoids hydration mismatch)
│
├── supabase/schema.sql           # Tables, RLS policies, helper functions, signup trigger
│
├── hardware-ingest/              # Runs on the EC2 VM (NOT part of the Next.js build)
│   ├── server.js                 # Zero-dep HTTP ingest (:8080) → Supabase
│   ├── mqtt-subscriber.js        # MQTT subscriber (everspark/<token>) → Supabase
│   ├── package.json              # mqtt dependency
│   └── README.md                 # EC2 / Mosquitto / device setup
│
├── docs/                         # ← you are here
├── .env.local.example            # Env var template
├── vercel.json                   # Framework hint
└── (config) next/tailwind/postcss/tsconfig
```

---

## 5. Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router), React 18 |
| Styling | Tailwind CSS (light theme: teal `#0d8e87` + slate-blue `#0284c7`) |
| Charts | Recharts |
| Icons | Lucide |
| Backend / DB / Auth | Supabase (PostgreSQL + Auth + RLS) |
| Hosting (dashboard) | Vercel |
| Hosting (ingest) | AWS EC2 free-tier (or any always-on VM) |
| MQTT broker | Mosquitto |
| Hardware | Arduino + SIM800L (2G/HTTP) or PUSR USR-G771 (4G/MQTT) |
