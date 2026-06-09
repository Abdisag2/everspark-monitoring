# Ever Spark Monitoring

A premium, **multi-tenant IoT dashboard** for **Clara** chlorine-production field
nodes. Cellular hardware (Arduino + SIM800L over 2G, or PUSR USR-G771 over 4G)
streams 9-parameter telemetry into a real-time, role-based web dashboard with
auth, alarms, and per-organization data isolation.

> **Runs in demo mode with zero config** (mock data + mock auth). Add Supabase to
> go live, and an ingest VM to connect real hardware.

```
Field hardware ──HTTP / MQTT──▶ EC2 ingest ──▶ Supabase (Postgres + RLS) ──▶ Next.js dashboard (Vercel)
```

---

## Features

- **Role-based access** — Admin (global), Manager (own org, CRUD), Viewer (own
  org, read-only), enforced by Postgres Row-Level Security.
- **Auth** — login, session persistence, password reset, email invitations
  (Supabase Auth), admin "Preview as" impersonation.
- **Live telemetry** — global stream, per-device charts (flow, production state,
  voltage, chlorine & pH), live hardware feed, CSV export, rich time-range picker
  (5 min → 5 years + calendar ranges).
- **Server-side alarms** — production-complete & NaClO-depleted, raised on
  ingest, acknowledged on the dashboard.
- **Two hardware transports** — plain-HTTP (SIM800L) and MQTT (USR-G771), both
  reusing the same device tokens, database, and dashboard.
- **Telemetry simulator** — inject test frames and watch real frames arrive.

---

## Quick start (demo mode)

```bash
npm install
npm run dev          # http://localhost:3000
```
Sign in with a **demo quick-sign-in** chip; password is `everspark`.

To go live, add Supabase env vars (see below) and the demo mode switches off
automatically.

---

## Documentation

| Doc | What's inside |
|-----|---------------|
| **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | System design, data model, RLS, frontend architecture, **full directory structure**, tech stack |
| **[docs/SETUP.md](./docs/SETUP.md)** | Local dev, Supabase project + schema + keys, env vars, **Vercel deployment**, first admin user, gotchas |
| **[docs/HARDWARE.md](./docs/HARDWARE.md)** | **Ingest VM**, HTTP + MQTT services, device/token registration, SIM800L & USR-G771 config, verification, troubleshooting |
| **[hardware-ingest/README.md](./hardware-ingest/README.md)** | Condensed on-the-VM reference |
| **[supabase/schema.sql](./supabase/schema.sql)** | Tables, RLS policies, helper functions, signup trigger |

---

## Tech stack

Next.js 14 (App Router) · React 18 · Tailwind CSS · Recharts · Lucide ·
Supabase (PostgreSQL + Auth + RLS) · Vercel · AWS EC2 + Mosquitto (ingest)

---

## Repository layout (top level)

```
app/              Next.js routes (dashboard, login, welcome, /api/ingest, /api/invite)
components/       UI by role (admin / manager / viewer) + charts / layout / shared
context/          AppContext — global state, auth, live Supabase sync
lib/              supabase client, types, mock data, utils, nav, time ranges
supabase/         schema.sql (tables + RLS)
hardware-ingest/  EC2 services: server.js (HTTP) + mqtt-subscriber.js (MQTT)
docs/             this documentation set
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#4-directory-structure) for the
full annotated tree.

---

## The data frame

Devices send a 9-parameter Clara frame:
```
;flow,voltage,level1,level2,level3,naclo,target_frc,active_cl,pH:
e.g.  ;35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:
```
HTTP body: `token=<secret_token>&data=<frame>` · MQTT: topic `everspark/<secret_token>`, payload `<frame>`.

---

## License

Proprietary — Ever Spark Tech.
