# EverSpark Monitoring

A premium, **multi-tenant IoT dashboard** for **Clara** chlorine-production field nodes. Cellular hardware streams 9-parameter telemetry into a real-time, role-based web dashboard with auth, alarms, CSV export, and per-organization data isolation.

> **Runs in demo mode with zero config** — mock data and mock auth work out of the box. Add Supabase credentials to go live, and an ingest VM to connect real hardware.

```
Field hardware ──HTTP / MQTT──▶ EC2 ingest ──▶ Supabase (Postgres + RLS) ──▶ Next.js dashboard (Vercel)
```

---

## Features

| Category | Details |
|----------|---------|
| **Role-based access** | Admin (global), Manager (own org, CRUD), Viewer (read-only) — enforced by Postgres RLS |
| **Auth** | Email/password login, session persistence, password reset, email invitations, admin "Preview as" impersonation |
| **Live telemetry** | Real-time stream, per-device charts (flow, voltage, chlorine, pH), live hardware feed, CSV export |
| **Time-range picker** | 5 min → 5 years plus custom calendar ranges |
| **Server-side alarms** | Production-complete & NaClO-depleted, raised on ingest, acknowledged on dashboard |
| **Hardware transports** | Plain HTTP (SIM800L/2G) and MQTT (USR-G771/4G) — same tokens, DB, and dashboard |
| **Telemetry simulator** | Inject test frames and watch them arrive in the live feed |

---

## Quick start (demo mode)

```bash
npm install
npm run dev          # → http://localhost:3000
```

Sign in with any **demo quick-sign-in** chip on the login screen. Password for all demo accounts: `everspark`.

To switch to live mode, add Supabase environment variables (see below) — demo mode turns off automatically when they are present.

---

## Environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API (keep secret) |

All three are required for live mode. Without them the app runs in demo mode.

---

## Scripts

```bash
npm run dev      # development server with hot reload
npm run build    # production build (also type-checks + lints)
npm run start    # serve the production build
npm run lint     # ESLint
```

---

## The data frame

Devices send a 9-parameter Clara frame:

```
;flow,voltage,level1,level2,level3,naclo,target_frc,active_cl,pH:

e.g.  ;35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:
```

- **HTTP** body: `token=<secret_token>&data=<frame>`
- **MQTT** topic: `everspark/<secret_token>`, payload: `<frame>`

---

## Repository layout

```
app/              Next.js routes — dashboard, login, welcome, /api/ingest, /api/invite
components/       UI panels by role (admin / manager / viewer) + charts, layout, shared
context/          AppContext — global state, auth, live Supabase sync
lib/              Supabase client, types, mock data, utilities, nav, time ranges
supabase/         schema.sql (tables + RLS policies + triggers)
hardware-ingest/  EC2 services: server.js (HTTP :8080) + mqtt-subscriber.js (MQTT :1883)
docs/             Full documentation set (see below)
```

---

## Documentation

| Doc | Contents |
|-----|---------|
| [docs/SPRINT_PLAN.md](./docs/SPRINT_PLAN.md) | 6-sprint product roadmap — feature backlog, DB changes, acceptance criteria |
| [docs/TASKS.md](./docs/TASKS.md) | Individual task board with task IDs (ES-XXYY) across all 6 sprints |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, data model, RLS, frontend architecture, full directory tree, tech stack |
| [docs/SETUP.md](./docs/SETUP.md) | Local dev, Supabase project + schema + keys, env vars, Vercel deployment, first admin user |
| [docs/HARDWARE.md](./docs/HARDWARE.md) | Ingest VM setup, HTTP + MQTT services, device/token registration, SIM800L & USR-G771 config, troubleshooting |
| [hardware-ingest/README.md](./hardware-ingest/README.md) | Condensed on-the-VM reference |
| [supabase/schema.sql](./supabase/schema.sql) | Tables, RLS policies, helper functions, signup trigger |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, Recharts, Lucide |
| Backend / DB | Supabase (PostgreSQL + Auth + Row-Level Security) |
| Hosting | Vercel (dashboard), AWS EC2 free tier (ingest VM) |
| Hardware bridge | Mosquitto MQTT broker, Node.js HTTP server |
| Language | TypeScript 5.8 |

---

## License

Proprietary — Ever Spark Tech.
