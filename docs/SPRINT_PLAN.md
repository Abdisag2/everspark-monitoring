# EverSpark Monitoring — Product Sprint Plan

**Project:** EverSpark Monitoring Platform  
**Stack:** Next.js 14, Supabase, Tailwind CSS, Recharts  
**Planning date:** 2026-06-17  
**Total sprints:** 6 × 2-week sprints (12 weeks / ~3 months)

---

## Feature Backlog Overview

| # | Feature | Sprint | Priority |
|---|---------|--------|----------|
| 1 | Custom roles & granular permissions | S1 | Critical |
| 2 | Dashboard builder (drag-and-drop widgets) | S2 | High |
| 3 | Threshold-based configurable alarms | S1 | Critical |
| 4 | Offline / reconnect detection | S1 | Critical |
| 5 | Push notifications (browser + SMS) | S3 | High |
| 6 | Device health scoring | S2 | High |
| 7 | Audit log | S2 | High |
| 8 | Maintenance mode | S2 | Medium |
| 9 | Bulk CSV export | S1 | Medium |
| 10 | Report scheduling (auto-email PDF/CSV) | S4 | Medium |
| 11 | Trend anomaly detection | S4 | Medium |
| 12 | Cross-device chart comparison | S3 | Medium |
| 13 | Production totals KPI cards | S2 | Medium |
| 14 | Mobile-responsive layout | S5 | Medium |
| 15 | API key access (REST/webhook) | S5 | Medium |
| 16 | Multi-language support (i18n) | S6 | Low |

---

## Sprint 1 — Foundation & Critical Ops (Weeks 1–2)

**Theme:** Close the biggest operational gaps — alarms, offline detection, and the start of a flexible permissions model.

### S1-1 · Custom Roles & Granular Permissions (Phase 1)

**Goal:** Replace the hard-coded `admin | manager | viewer` triad with a configurable permission system that admins can extend.

#### Database changes (`supabase/schema.sql`)
```sql
-- New table: permission sets
CREATE TABLE roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,           -- e.g. "Field Technician"
  org_id    UUID REFERENCES organizations ON DELETE CASCADE,  -- NULL = platform-wide
  created_at TIMESTAMPTZ DEFAULT now()
);

-- New table: individual permissions per role
CREATE TABLE role_permissions (
  role_id     UUID REFERENCES roles ON DELETE CASCADE,
  permission  TEXT NOT NULL,          -- e.g. "devices:read", "alarms:acknowledge"
  PRIMARY KEY (role_id, permission)
);

-- profiles: add custom_role_id alongside hard-coded role
ALTER TABLE profiles ADD COLUMN custom_role_id UUID REFERENCES roles;
```

#### Permission keys (initial set)
| Key | Meaning |
|-----|---------|
| `devices:read` | View devices and telemetry |
| `devices:write` | Create / edit / delete devices |
| `alarms:read` | See alarms |
| `alarms:acknowledge` | Acknowledge alarms |
| `alarms:configure` | Create/edit threshold rules |
| `members:read` | View team members |
| `members:invite` | Send invitations |
| `members:manage` | Edit/delete team members |
| `org:read` | View org settings |
| `org:write` | Edit org settings |
| `reports:export` | Export CSV / generate reports |
| `dashboard:customize` | Save personal dashboard layouts |

#### Frontend work
- `components/admin/RoleManager.tsx` — CRUD UI for roles and their permissions (checkbox grid)
- `lib/permissions.ts` — `hasPermission(user, key)` helper replacing raw role checks
- Update `AppContext` to load `custom_role_id` and resolve effective permissions
- Update all `role === 'admin'` guards to use `hasPermission()` instead
- New nav item: **Roles & Permissions** under admin panel

#### RLS updates
- Add policies on `roles` and `role_permissions` tables (admins full control, managers read own-org roles)

**Acceptance criteria:**
- Admin can create a "Field Technician" role with only `devices:read` + `alarms:acknowledge`
- Assigning that role to a user restricts their dashboard accordingly
- Existing `admin / manager / viewer` defaults still work unchanged

---

### S1-2 · Threshold-Based Configurable Alarms

**Goal:** Let managers define numeric alert rules per device/parameter rather than relying on the two hard-coded alarm types.

#### Database changes
```sql
CREATE TABLE alarm_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES organizations ON DELETE CASCADE,
  device_id    UUID REFERENCES devices ON DELETE CASCADE,  -- NULL = all org devices
  parameter    TEXT NOT NULL,    -- 'flow_rate' | 'voltage' | 'ph_value' | 'active_chlorine' | ...
  condition    TEXT NOT NULL,    -- 'lt' | 'gt' | 'lte' | 'gte'
  threshold    NUMERIC NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'warning',  -- 'info' | 'warning' | 'critical'
  label        TEXT,             -- human-readable name
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES profiles,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

#### Changes to alarm type
```ts
// lib/types.ts — extend AlarmType
type AlarmType = 'production_complete' | 'no_naclo' | 'threshold_breach'

// AlarmRecord — add fields
severity: 'info' | 'warning' | 'critical'
rule_id?: string
parameter?: string
value?: number
```

#### Ingest changes (`app/api/ingest/route.ts`)
- After writing telemetry, query `alarm_rules` for the device's org
- Evaluate each active rule against the incoming frame
- Insert alarms for any breached rules (same 1-hour debounce)

#### Frontend work
- `components/manager/AlarmRules.tsx` — manager UI to create/edit/delete threshold rules
- `components/shared/AlarmBadge.tsx` — colour-coded by severity (info=blue, warning=amber, critical=red)
- Update alarm cards in Admin and Manager dashboards to show severity and parameter value

**Acceptance criteria:**
- Manager sets rule: pH < 6.5 → warning. Simulator frame with pH 6.0 raises that alarm.
- Critical alarms render in red; existing alarm types still work.

---

### S1-3 · Offline / Reconnect Detection

**Goal:** Surface "device offline" prominently when no frame has been received within a configurable window.

#### Database changes
```sql
ALTER TABLE devices ADD COLUMN offline_threshold_minutes INT NOT NULL DEFAULT 15;
```

#### New API route: `app/api/cron/device-status/route.ts`
- Run every 5 minutes (Vercel cron or external cron)
- Compare `last_seen` against `now() - offline_threshold_minutes`
- Flip `status` to `'offline'` and raise an `'device_offline'` alarm if threshold crossed
- Flip back to `'online'` on next ingest frame + raise `'device_reconnected'` alarm

#### Frontend work
- Add `'device_offline'` + `'device_reconnected'` to `AlarmType`
- Device cards: pulsing red border when offline > 30 min
- Admin dashboard: **Offline** metric card already exists — wire to real status
- Toast notification when a device goes offline while the dashboard is open

**Acceptance criteria:**
- Stop simulator for 20 min → device card shows offline state automatically.
- Resume → card turns online and a reconnect alarm appears.

---

### S1-4 · Bulk CSV Export

**Goal:** Export telemetry for all devices in an org in one action.

#### Changes
- `app/api/export/route.ts` — GET with `?org_id=&from=&to=&devices=all` params, streams CSV
- Manager dashboard: **Export All** button next to existing per-device export
- Admin dashboard: org-level export in OrganizationManagement panel

**Acceptance criteria:**
- Single download produces one CSV with a `device_name` column prepended, all devices, chosen time range.

---

## Sprint 2 — Dashboard Builder & Operational Intelligence (Weeks 3–4)

**Theme:** Give users control over what they see; add production KPIs, health scoring, and audit trail.

### S2-1 · Dashboard Builder

**Goal:** Let each user drag, resize, and save a personal layout of metric widgets.

#### Architecture decision
Use **CSS Grid + manual drag** (no heavy lib) — widgets snap to a 12-column grid. Layouts are saved as JSON in Supabase.

#### Database changes
```sql
CREATE TABLE dashboard_layouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'My Dashboard',
  layout     JSONB NOT NULL,   -- array of { widget_id, col, row, w, h, config }
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Widget registry (`lib/widgets.ts`)
| Widget ID | Name | Roles |
|-----------|------|-------|
| `kpi_online_devices` | Online Devices | all |
| `kpi_offline_devices` | Offline Devices | all |
| `kpi_active_alarms` | Active Alarms | all |
| `kpi_avg_chlorine` | Avg Active Chlorine | all |
| `kpi_naclo_consumed` | NaClO Consumed Today | manager, admin |
| `chart_flow_rate` | Flow Rate Chart | all |
| `chart_chlorine_ph` | Chlorine & pH | all |
| `chart_voltage` | System Voltage | all |
| `table_telemetry` | Raw Telemetry Table | manager, admin |
| `table_alarms` | Active Alarms Table | all |
| `map_devices` | Device Map (future) | all |
| `feed_live` | Live Hardware Feed | admin |

#### Frontend work
- `components/dashboard/DashboardBuilder.tsx` — edit mode toggle, widget palette, drag-to-place
- `components/dashboard/WidgetRenderer.tsx` — renders any widget by ID with its config
- `components/dashboard/GridCanvas.tsx` — CSS grid canvas, drag handles, resize handles
- Replace static `AdminDashboard`, `ManagerDashboard`, `DeviceList` with `DashboardRenderer` that reads saved layout
- Default layouts seeded per role (preserves current UX for new users)
- **Save Layout** / **Reset to Default** / **New Dashboard** actions

**Acceptance criteria:**
- User adds/removes/reorders widgets, saves, refreshes — layout persists.
- Role-restricted widgets are not available in the palette for lower roles.

---

### S2-2 · Device Health Scoring

**Goal:** Composite 0–100 score per device; shown as a colour badge on device cards.

#### Scoring formula (configurable weights)
| Signal | Weight |
|--------|--------|
| Last seen within threshold | 30 pts |
| Voltage in range (11–14 V) | 20 pts |
| Flow rate > 0 | 20 pts |
| No unacknowledged critical alarms | 20 pts |
| pH in range (6.5–8.5) | 10 pts |

#### Implementation
- `lib/health.ts` — `computeHealthScore(device, latestTelemetry, alarms): number`
- Device cards: badge `Excellent (92)` / `Good (75)` / `Fair (55)` / `Poor (<40)` in green/yellow/amber/red
- Admin dashboard: average fleet health KPI widget
- Health score included in CSV export

**Acceptance criteria:**
- Device with no recent frames + critical alarm scores < 40 and shows "Poor" badge.

---

### S2-3 · Audit Log

**Goal:** Immutable record of all user actions for compliance.

#### Database changes
```sql
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID REFERENCES profiles,
  actor_email TEXT,
  action      TEXT NOT NULL,    -- 'alarm.acknowledged' | 'device.created' | 'member.invited' | ...
  target_type TEXT,             -- 'device' | 'alarm' | 'profile' | 'org'
  target_id   TEXT,
  detail      JSONB,
  org_id      UUID REFERENCES organizations,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- RLS: admins read all; managers read own org; no deletes
```

#### Instrumented actions
- Alarm acknowledged
- Device created / updated / deleted
- Member invited / deactivated / role changed
- Org settings changed
- Dashboard layout saved
- CSV exported
- Login / logout (via Supabase auth webhooks)

#### Frontend work
- `components/admin/AuditLog.tsx` — filterable table (by actor, action type, date range)
- Manager sees own-org audit log under Org Settings

**Acceptance criteria:**
- Acknowledging an alarm creates an audit entry with actor email, alarm ID, and timestamp.

---

### S2-4 · Maintenance Mode

**Goal:** Admin or manager can mark a device as "under maintenance" to suppress alarms.

#### Changes
```sql
ALTER TABLE devices ADD COLUMN maintenance_mode BOOLEAN DEFAULT false;
ALTER TABLE devices ADD COLUMN maintenance_note TEXT;
ALTER TABLE devices ADD COLUMN maintenance_until TIMESTAMPTZ;
```
- Ingest route: skip alarm evaluation for devices in maintenance mode
- Device card: yellow "Maintenance" banner with countdown
- DeviceConfiguration panel: toggle + optional end datetime + note field

**Acceptance criteria:**
- Device in maintenance mode receives telemetry but raises no alarms until mode is cleared.

---

### S2-5 · Production Totals KPI Cards

**Goal:** Show cumulative production metrics per org/device over a chosen period.

#### New computed fields
- **Total flow volume** (L): `SUM(flow_rate) × frame_interval` per device per day
- **Total NaClO pumped** (L): `SUM(naclo_pumped)`
- **Avg active chlorine** (mg/L): `AVG(active_chlorine)`
- **Production uptime %**: frames with `level_sensor_1 = 1` / total frames

#### Frontend work
- `components/shared/ProductionKpis.tsx` — 4-card strip, time range aware
- Displayed on Manager dashboard header and Device Detail view

---

## Sprint 3 — Notifications & Analytics (Weeks 5–6)

**Theme:** Make alerts proactive and give users richer analysis tools.

### S3-1 · Push Notifications (Browser)

#### Implementation
- `app/api/push/subscribe/route.ts` — store Web Push subscription in new `push_subscriptions` table
- `app/api/push/send/route.ts` — internal endpoint called by ingest when alarm fires
- `public/sw.js` — service worker to receive push events
- `components/shared/NotificationBell.tsx` — request permission + subscribe UI
- Notification payload: device name, alarm type, severity, timestamp

#### SMS (optional / Phase 2)
- Integrate Twilio or Africa's Talking (relevant for African deployments)
- `sms_recipients` table: profile_id + phone number + notification preferences

**Acceptance criteria:**
- Browser tab in background receives push notification within 5 s of alarm fire.

---

### S3-2 · Cross-Device Chart Comparison

**Goal:** Overlay up to 3 devices' telemetry on the same chart axes.

#### Frontend work
- `components/shared/CompareChart.tsx` — multi-line Recharts with device-colour legend
- Device selector (up to 3) in a comparison panel accessible from Manager and Admin dashboards
- Supported parameters: flow rate, active chlorine, pH, voltage
- Time range picker reused from existing component

**Acceptance criteria:**
- Select 2 devices, choose "Flow Rate", view overlaid lines for last 24 h.

---

### S3-3 · Custom Roles & Permissions (Phase 2)

**Goal:** Complete the permission work from S1 — UI polish, role templates, and org-scoped custom roles.

- Role templates: "Read Only", "Technician", "Supervisor" pre-seeded
- Permission inheritance: custom roles can extend a base role
- Manager can create org-scoped roles (cannot exceed their own permissions)
- Permission diff view: show what access a user will gain/lose on role change

---

## Sprint 4 — Reporting & Intelligence (Weeks 7–8)

**Theme:** Automate insights delivery and add anomaly awareness.

### S4-1 · Report Scheduling

**Goal:** Managers receive auto-generated daily/weekly summary emails.

#### Implementation
- `report_schedules` table: `profile_id`, `frequency` (daily/weekly), `format` (csv/pdf), `last_sent`
- `app/api/cron/reports/route.ts` — runs nightly, generates and emails reports
- Report content: production totals, alarm summary, device health, top anomalies
- PDF generation: `@react-pdf/renderer` or `puppeteer` screenshot of a headless report page
- Email: Supabase Edge Function + Resend / SendGrid

**Acceptance criteria:**
- Manager opts in to weekly report. Next Monday they receive an email with org production summary.

---

### S4-2 · Trend Anomaly Detection

**Goal:** Flag readings that deviate significantly from a device's own rolling baseline.

#### Algorithm
- Rolling 7-day z-score per parameter per device (computed on ingest)
- If `|z| > 3` (3 standard deviations) → raise `'anomaly'` alarm with parameter + value + z-score
- "Learning period": first 48 h of data excluded from anomaly checks

#### Implementation
- `app/api/ingest/route.ts` — add anomaly check after threshold check
- `anomaly` added to `AlarmType`
- Admin: anomaly alarms shown with "Anomaly" tag and z-score detail

**Acceptance criteria:**
- Device flow rate suddenly drops to 0 after days of ~35 L/min → anomaly alarm fires within one frame.

---

## Sprint 5 — Platform & Access (Weeks 9–10)

**Theme:** Open the platform to integrations and mobile field use.

### S5-1 · Mobile-Responsive Layout

**Goal:** Field technicians can use the dashboard on a phone.

#### Approach
- Audit all component widths — replace fixed px with responsive Tailwind classes
- Navigation: collapsible side drawer on mobile (hamburger menu)
- Device cards: single-column stack on screens < 640 px
- Charts: fixed height 200 px on mobile, full height on desktop
- Touch-friendly tap targets (min 44 × 44 px)
- Test on iOS Safari + Android Chrome

**Acceptance criteria:**
- Full Viewer and Manager flows usable on a 375 px wide viewport without horizontal scroll.

---

### S5-2 · API Key Access

**Goal:** Organizations can pull their own telemetry via a REST API.

#### Implementation
```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw key
  permissions TEXT[] NOT NULL,        -- subset of permission keys from S1
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES profiles,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/devices` | List org devices |
| GET | `/api/v1/devices/:id/telemetry` | Paginated telemetry with `from`, `to`, `limit` |
| GET | `/api/v1/alarms` | List alarms with filters |
| POST | `/api/v1/alarms/:id/acknowledge` | Acknowledge an alarm |

- Auth: `Authorization: Bearer <api_key>` header
- Rate limiting: 1000 req/day per key (tracked in Redis or Supabase KV)
- `components/manager/ApiKeys.tsx` — create / revoke keys, view permissions, see last-used

**Acceptance criteria:**
- Manager creates key with `devices:read` + `alarms:read`. Key works in curl. Revoked key returns 401.

---

## Sprint 6 — Polish & i18n (Weeks 11–12)

**Theme:** Production hardening, accessibility, and first internationalisation pass.

### S6-1 · Multi-Language Support (i18n)

**Goal:** French and Portuguese locales (common in francophone/lusophone Africa).

#### Implementation
- `next-intl` library
- Locale files: `messages/en.json`, `messages/fr.json`, `messages/pt.json`
- Locale switcher in user profile menu
- Locale preference stored on `profiles.locale` column
- Date/number formatting via `Intl` API

**Priority strings:** all UI labels, alarm messages, email templates.

---

### S6-2 · Hardening & Performance

- Add `React.memo` + `useMemo` to heavy chart components
- Paginate telemetry table (currently loads 200 rows) — virtual list or server pagination
- Add `loading` skeletons to all async data panels
- Error boundaries around each dashboard widget
- Add `robots.txt`, `security.txt`, CSP headers
- E2E smoke tests with Playwright for login → dashboard → alarm acknowledge flow

---

## Dependency & Risk Register

| Risk | Mitigation |
|------|-----------|
| Supabase RLS complexity increases with custom roles | Thoroughly test each new policy in isolation; maintain a policy test script |
| Dashboard builder drag UX on mobile | Fallback to a simpler reorder-by-list on touch devices |
| Push notification browser support (Safari) | Graceful fallback to in-app toast; SMS as secondary channel |
| PDF report generation cold-start time | Pre-render on a scheduled EC2 job, email the file |
| API rate limiting without Redis | Use Supabase row counter + timestamp, acceptable at low scale |

---

## Definition of Done (all sprints)

- [ ] Feature works in demo mode (mock data) and live mode (Supabase)
- [ ] RLS policies updated and tested for all three base roles
- [ ] TypeScript: no new `any` types; `npm run build` passes
- [ ] Mobile viewport (375 px) does not break (from Sprint 5 onward applies retroactively)
- [ ] Audit log entry written for every user-initiated state change
- [ ] README / docs updated if a new env var or setup step is required

---

## Velocity Assumptions

| Sprint | Story points (est.) | Notes |
|--------|--------------------|----|
| S1 | 34 | Heavy DB + logic changes |
| S2 | 40 | Dashboard builder is the largest single feature |
| S3 | 28 | Push APIs have external dependencies |
| S4 | 24 | Anomaly algorithm is self-contained |
| S5 | 30 | Mobile CSS sweep is time-consuming but predictable |
| S6 | 20 | i18n is mostly string extraction |

---

*Last updated: 2026-06-17*
