# Ever Spark Monitoring

A premium, multi-tenant IoT monitoring dashboard for **Clara** chlorine-production
field nodes (Arduino Mega + SIM800L over Ethio Telecom). Built with Next.js App
Router, Tailwind CSS, Lucide, Recharts and Supabase (PostgreSQL + RLS).

> Runs fully in **demo mode** out of the box — mock data + a mock Supabase client.
> Add Supabase env vars to go live.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Use the **"View as"** switcher in the top bar to instantly cycle between
**Admin (global)**, **Manager (Addis Ababa W&S)** and **Viewer (Addis Ababa W&S)**
and watch the data isolation in real time.

## Role-based access

| Role | Sees | Can do |
|------|------|--------|
| **Admin** | Everything, globally | CRUD orgs, devices (+ tokens), all members; telemetry simulator |
| **Manager** | Own organization only | CRUD own devices & team (manager/viewer only — admin blocked), edit org |
| **Viewer** | Own organization only | Read-only live monitoring, charts, raw data, CSV export |

## Hardware ingest

Field nodes POST raw `application/x-www-form-urlencoded` to `/api/ingest`:

```
POST /api/ingest
User-Agent: field-node
ngrok-skip-browser-warning: 69420
Content-Type: application/x-www-form-urlencoded

token=<secret_token>&data=;P1,P2,P3,P4,P5,P6,P7,P8,P9:
```

Frame: `flow, voltage, level1, level2, level3, NaClO, target_frc, active_cl, pH`.

The in-app **Telemetry Simulator** (Admin ▸ Tools) emulates this exactly and can
also POST to the live endpoint.

## Going live with Supabase

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor (tables +
   RLS policies + helpers).
3. Copy `.env.local.example` → `.env.local` and fill in the keys.
4. Redeploy. `/api/ingest` persists telemetry via the service-role key.

## Stack

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS, Lucide, Recharts
- **State:** React context with RLS-mimicking, role-scoped selectors
- **Backend:** Supabase Auth + PostgreSQL + Row-Level Security
- **Deploy:** Vercel (via GitHub)
