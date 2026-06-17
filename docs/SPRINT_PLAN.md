# EverSpark Monitoring — Sprint Plan

**Project:** EverSpark Monitoring Platform  
**Stack:** Next.js 14 · Supabase · Tailwind CSS · Recharts · TypeScript  
**Planning date:** 2026-06-17  
**Cadence:** 2-week sprints · 6 sprints · 12 weeks total  
**Team velocity target:** ~30 story points / sprint

---

## Roadmap Timeline

```
Week  1  2  3  4  5  6  7  8  9 10 11 12
      ├──S1───┤├──S2───┤├──S3───┤├──S4───┤├──S5───┤├──S6───┤
S1    Foundation & Critical Ops
S2              Dashboard Builder & Intelligence
S3                        Notifications & Analytics
S4                                  Reporting & ML
S5                                            Platform & Mobile
S6                                                      Polish & i18n
```

---

## Backlog Overview

| ID | Story | Sprint | Points | Priority | Status |
|----|-------|--------|--------|----------|--------|
| S1-1 | Custom roles & granular permissions (Phase 1) | S1 | 8 | Critical | Backlog |
| S1-2 | Threshold-based configurable alarms | S1 | 8 | Critical | Backlog |
| S1-3 | Offline / reconnect detection | S1 | 5 | Critical | Backlog |
| S1-4 | Bulk CSV export | S1 | 3 | Medium | Backlog |
| S2-1 | Dashboard builder (drag-and-drop widgets) | S2 | 13 | High | Backlog |
| S2-2 | Device health scoring | S2 | 5 | High | Backlog |
| S2-3 | Audit log | S2 | 5 | High | Backlog |
| S2-4 | Maintenance mode | S2 | 3 | Medium | Backlog |
| S2-5 | Production totals KPI cards | S2 | 3 | Medium | Backlog |
| S3-1 | Push notifications — browser | S3 | 8 | High | Backlog |
| S3-2 | Push notifications — SMS | S3 | 5 | Medium | Backlog |
| S3-3 | Cross-device chart comparison | S3 | 5 | Medium | Backlog |
| S3-4 | Custom roles & permissions (Phase 2) | S3 | 5 | High | Backlog |
| S4-1 | Report scheduling (auto-email PDF/CSV) | S4 | 8 | Medium | Backlog |
| S4-2 | Trend anomaly detection | S4 | 8 | Medium | Backlog |
| S4-3 | Production uptime analytics | S4 | 5 | Medium | Backlog |
| S5-1 | Mobile-responsive layout | S5 | 13 | Medium | Backlog |
| S5-2 | REST API key access | S5 | 8 | Medium | Backlog |
| S6-1 | Multi-language support — FR + PT | S6 | 8 | Low | Backlog |
| S6-2 | Performance hardening & E2E tests | S6 | 8 | Medium | Backlog |

**Total: 176 story points across 6 sprints**

---

## Definition of Done

Every story must satisfy ALL of the following before moving to Done:

- [ ] Works in **demo mode** (mock data) and **live mode** (Supabase)
- [ ] All new DB tables have correct **RLS policies** covering admin / manager / viewer
- [ ] `npm run build` passes with **zero TypeScript errors**
- [ ] No new `any` types introduced
- [ ] **Audit log** entry written for every user-initiated state change (from S2 onward)
- [ ] Feature is **accessible**: keyboard-navigable, correct aria labels
- [ ] README or docs updated if a new env var or setup step is required

---

---

# Sprint 1 — Foundation & Critical Ops

**Dates:** Week 1–2  
**Goal:** Close the biggest operational gaps before building on top of them.  
**Capacity:** 24 points  
**Theme:** Alarms, offline detection, flexible permissions groundwork

---

## S1-1 · Custom Roles & Granular Permissions (Phase 1)

**Points:** 8 · **Priority:** Critical · **Status:** Backlog

**Goal:** Replace the hard-coded `admin | manager | viewer` triad with a configurable permission system that admins can extend without a code deploy.

### Why this first
All subsequent features (dashboard builder, API keys, report access) gate their UI on permissions. The permission helper must exist before those stories start.

### Database migrations

```sql
-- 1. Custom role definitions (org-scoped or platform-wide)
CREATE TABLE roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  org_id     UUID REFERENCES organizations ON DELETE CASCADE, -- NULL = platform-wide template
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Permission assignments per role
CREATE TABLE role_permissions (
  role_id    UUID REFERENCES roles ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- 3. Link profiles to a custom role (additive on top of base role)
ALTER TABLE profiles ADD COLUMN custom_role_id UUID REFERENCES roles;

-- 4. RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_admin_all    ON roles FOR ALL USING (is_admin());
CREATE POLICY roles_member_read  ON roles FOR SELECT USING (org_id = current_org() OR org_id IS NULL);
CREATE POLICY rp_admin_all       ON role_permissions FOR ALL USING (is_admin());
CREATE POLICY rp_member_read     ON role_permissions FOR SELECT
  USING (role_id IN (SELECT id FROM roles WHERE org_id = current_org() OR org_id IS NULL));
```

### Permission key registry

| Permission key | Description |
|----------------|-------------|
| `devices:read` | View devices and telemetry |
| `devices:write` | Create / edit / delete devices |
| `alarms:read` | View alarms |
| `alarms:acknowledge` | Acknowledge alarms |
| `alarms:configure` | Create / edit threshold rules |
| `members:read` | View team members |
| `members:invite` | Send email invitations |
| `members:manage` | Edit / deactivate team members |
| `org:read` | View org settings |
| `org:write` | Edit org settings |
| `reports:export` | Export CSV / generate reports |
| `dashboard:customize` | Save personal dashboard layouts |

### Files to create / modify

| File | Change |
|------|--------|
| `lib/permissions.ts` | NEW — `hasPermission(user, key): boolean`; resolves base role + custom role |
| `context/AppContext.tsx` | Load `custom_role_id` + resolved permission set on login |
| `components/admin/RoleManager.tsx` | NEW — CRUD UI: role name, permission checkbox grid, assign to user |
| `lib/types.ts` | Add `Permission`, `Role`, `RolePermission` types |
| `app/dashboard/page.tsx` | Replace `role === 'admin'` guards with `hasPermission()` calls |

### Acceptance criteria

- [ ] Admin creates role "Field Technician" with `devices:read` + `alarms:acknowledge` only
- [ ] User assigned that role sees devices/alarms but no member management or org settings
- [ ] Existing `admin / manager / viewer` base roles work exactly as before
- [ ] `hasPermission(user, 'devices:write')` returns `false` for a viewer regardless of custom role

---

## S1-2 · Threshold-Based Configurable Alarms

**Points:** 8 · **Priority:** Critical · **Status:** Backlog

**Goal:** Managers define numeric alert rules per parameter instead of relying on the two hard-coded alarm types.

### Database migrations

```sql
CREATE TABLE alarm_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations ON DELETE CASCADE,
  device_id   UUID REFERENCES devices ON DELETE CASCADE, -- NULL = applies to all org devices
  parameter   TEXT NOT NULL
    CHECK (parameter IN ('flow_rate','voltage','ph_value','active_chlorine',
                         'naclo_pumped','target_frc','level_sensor_1',
                         'level_sensor_2','level_sensor_3')),
  condition   TEXT NOT NULL CHECK (condition IN ('lt','lte','gt','gte','eq')),
  threshold   NUMERIC NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  label       TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES profiles,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alarm_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_admin_all       ON alarm_rules FOR ALL USING (is_admin());
CREATE POLICY ar_manager_all     ON alarm_rules FOR ALL
  USING (org_id = current_org() AND current_role() = 'manager');
CREATE POLICY ar_member_select   ON alarm_rules FOR SELECT USING (org_id = current_org());
```

### Type changes (`lib/types.ts`)

```ts
type AlarmType = 'production_complete' | 'no_naclo' | 'threshold_breach'
                 | 'device_offline' | 'device_reconnected' | 'anomaly'

interface AlarmRecord {
  // existing fields +
  severity: 'info' | 'warning' | 'critical'
  rule_id?: string
  parameter?: string
  value?: number
}
```

### Ingest changes (`app/api/ingest/route.ts`)

After writing the telemetry row:
1. Query `alarm_rules` for `org_id` of the device (or device-specific rules)
2. Evaluate each active rule: `frame[parameter] <condition> threshold`
3. For breached rules: check no unacknowledged alarm for same `rule_id` in last 1 hour
4. Insert `alarms` row with `alarm_type = 'threshold_breach'`, severity, parameter, value

### Files to create / modify

| File | Change |
|------|--------|
| `components/manager/AlarmRules.tsx` | NEW — list, create, edit, delete threshold rules |
| `components/shared/AlarmBadge.tsx` | NEW — colour-coded chip: info=blue, warning=amber, critical=red |
| `components/admin/AdminDashboard.tsx` | Show severity badge and parameter value on alarm cards |
| `components/manager/ManagerDashboard.tsx` | Same |
| `app/api/ingest/route.ts` | Add threshold evaluation block |
| `lib/types.ts` | Extend `AlarmType`, `AlarmRecord` |

### Acceptance criteria

- [ ] Manager creates rule: `ph_value < 6.5`, severity = warning, label = "Low pH"
- [ ] Simulator sends frame with pH 6.0 → alarm appears with amber badge and "Low pH" label
- [ ] Critical alarm renders red; info alarm renders blue
- [ ] Existing `production_complete` and `no_naclo` alarms still fire as before

---

## S1-3 · Offline / Reconnect Detection

**Points:** 5 · **Priority:** Critical · **Status:** Backlog

**Goal:** Automatically flip a device to "offline" and raise an alarm when no frame arrives within a configurable window.

### Database migrations

```sql
ALTER TABLE devices ADD COLUMN offline_threshold_minutes INT NOT NULL DEFAULT 15;
```

### New cron route (`app/api/cron/device-status/route.ts`)

```
GET /api/cron/device-status
Authorization: Bearer <CRON_SECRET>
```

Logic (runs every 5 minutes via Vercel cron or external scheduler):
1. Fetch all devices where `status = 'online'` and `last_seen < now() - offline_threshold_minutes`
2. Batch UPDATE `status = 'offline'`
3. Insert `device_offline` alarm for each (debounced: skip if offline alarm exists in last 1 h)
4. Fetch devices where `status = 'offline'` and `last_seen > now() - 1 minute` (just reconnected)
5. Batch UPDATE `status = 'online'`
6. Insert `device_reconnected` alarm for each

### Vercel cron config (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/device-status", "schedule": "*/5 * * * *" }
  ]
}
```

### Frontend changes

| Component | Change |
|-----------|--------|
| `components/viewer/DeviceList.tsx` | Pulsing red ring on device card when status = offline |
| `components/shared/ToastProvider.tsx` | NEW — toast notification when device flips offline during open session |
| `lib/types.ts` | Add `'device_offline' \| 'device_reconnected'` to `AlarmType` |

### Acceptance criteria

- [ ] Stop simulator for 20 min → device card shows offline badge automatically (no refresh)
- [ ] Resume simulator → card returns to online within one polling cycle
- [ ] `device_reconnected` alarm appears in alarm list
- [ ] Offline alarm does not re-fire if device stays offline for hours (debounce working)

---

## S1-4 · Bulk CSV Export

**Points:** 3 · **Priority:** Medium · **Status:** Backlog

**Goal:** Export telemetry for all devices in an org in a single download.

### New API route (`app/api/export/route.ts`)

```
GET /api/export?org_id=<id>&from=<ISO>&to=<ISO>&devices=all
Authorization: Bearer <session_token>
```

- Streams CSV with headers: `device_name, timestamp, flow_rate, voltage, ...all 9 params`
- Enforces RLS: managers can only export their own org; admins can export any
- `Content-Disposition: attachment; filename="everspark-export-<date>.csv"`

### Frontend changes

- `components/manager/ManagerDashboard.tsx` — **Export All Devices** button with date range picker
- `components/admin/OrganizationManagement.tsx` — per-org export button in org detail panel

### Acceptance criteria

- [ ] Manager clicks Export All → downloads CSV with all org devices, `device_name` column present
- [ ] Manager cannot export another org's data (returns 403)
- [ ] Large exports (10k+ rows) stream without timeout

---

## Sprint 1 Summary

| Story | Points | Files changed |
|-------|--------|--------------|
| S1-1 Custom roles (Phase 1) | 8 | `lib/permissions.ts`, `context/AppContext.tsx`, `components/admin/RoleManager.tsx`, `lib/types.ts`, `app/dashboard/page.tsx` |
| S1-2 Threshold alarms | 8 | `components/manager/AlarmRules.tsx`, `components/shared/AlarmBadge.tsx`, `app/api/ingest/route.ts`, `lib/types.ts` |
| S1-3 Offline detection | 5 | `app/api/cron/device-status/route.ts`, `vercel.json`, `components/viewer/DeviceList.tsx`, `components/shared/ToastProvider.tsx` |
| S1-4 Bulk CSV export | 3 | `app/api/export/route.ts`, `components/manager/ManagerDashboard.tsx` |
| **Total** | **24** | |

---

---

# Sprint 2 — Dashboard Builder & Operational Intelligence

**Dates:** Week 3–4  
**Goal:** Give users layout control; add production KPIs, health scoring, audit trail, and maintenance mode.  
**Capacity:** 29 points  
**Theme:** Customisation + observability

---

## S2-1 · Dashboard Builder

**Points:** 13 · **Priority:** High · **Status:** Backlog

**Goal:** Each user can drag, resize, and persist a personal widget layout on a 12-column CSS grid.

### Architecture

- **No heavy drag library** — use HTML5 Drag API + CSS Grid (`grid-column`, `grid-row`)
- Layouts stored as JSONB in Supabase; loaded on login
- Default layouts seeded per base role so new users see the current dashboard immediately
- Edit mode toggled by a toolbar button; view mode is read-only

### Database migrations

```sql
CREATE TABLE dashboard_layouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'My Dashboard',
  layout     JSONB NOT NULL,
  -- layout shape: [{ widget_id, col, row, w, h, config: {} }]
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY dl_owner_all ON dashboard_layouts FOR ALL USING (profile_id = auth.uid());
```

### Widget registry (`lib/widgets.ts`)

| Widget ID | Display name | Min w×h | Allowed roles |
|-----------|-------------|---------|---------------|
| `kpi_online` | Online Devices | 2×1 | all |
| `kpi_offline` | Offline Devices | 2×1 | all |
| `kpi_alarms` | Active Alarms | 2×1 | all |
| `kpi_chlorine` | Avg Active Chlorine | 2×1 | all |
| `kpi_naclo` | NaClO Consumed Today | 2×1 | manager, admin |
| `kpi_health` | Fleet Health Score | 2×1 | admin |
| `chart_flow` | Flow Rate | 4×2 | all |
| `chart_chlorine_ph` | Chlorine & pH | 4×2 | all |
| `chart_voltage` | System Voltage | 4×2 | all |
| `table_telemetry` | Raw Telemetry | 6×3 | manager, admin |
| `table_alarms` | Active Alarms Table | 6×2 | all |
| `feed_live` | Live Hardware Feed | 4×2 | admin |
| `kpi_production` | Production Totals | 6×1 | manager, admin |

### Files to create / modify

| File | Description |
|------|-------------|
| `lib/widgets.ts` | Widget registry + type definitions |
| `components/dashboard/GridCanvas.tsx` | 12-col CSS Grid, drag-to-place, resize handles |
| `components/dashboard/WidgetPalette.tsx` | Side panel listing available widgets for current role |
| `components/dashboard/WidgetRenderer.tsx` | Switch on widget_id → render correct component |
| `components/dashboard/DashboardToolbar.tsx` | Edit / Save / Reset / New Dashboard buttons |
| `components/dashboard/DashboardPage.tsx` | Orchestrates canvas + toolbar + palette |
| `app/dashboard/page.tsx` | Replace static role dispatchers with `<DashboardPage />` |
| `app/api/layout/route.ts` | GET / POST / DELETE layout endpoints |

### Acceptance criteria

- [ ] User enters edit mode, drags a widget from palette onto canvas, drops it
- [ ] Resize handles change widget span; widget snaps to grid columns
- [ ] Save → refresh → layout persists exactly
- [ ] Role-restricted widgets not shown in palette for lower roles
- [ ] Reset to Default restores the role's seed layout
- [ ] Two dashboard layouts can be created and switched between

---

## S2-2 · Device Health Scoring

**Points:** 5 · **Priority:** High · **Status:** Backlog

**Goal:** Composite 0–100 score per device displayed as a colour-coded badge.

### Scoring formula

| Signal | Points | Pass condition |
|--------|--------|----------------|
| Last seen within offline threshold | 30 | `last_seen > now() - threshold` |
| Voltage in normal range | 20 | `11 V ≤ voltage ≤ 14 V` |
| Flow rate active | 20 | `flow_rate > 0` |
| No unacknowledged critical alarms | 20 | zero open critical alarms |
| pH in safe range | 10 | `6.5 ≤ ph_value ≤ 8.5` |

| Score | Label | Colour |
|-------|-------|--------|
| 90–100 | Excellent | Green |
| 70–89 | Good | Teal |
| 50–69 | Fair | Amber |
| < 50 | Poor | Red |

### Files to create / modify

| File | Change |
|------|--------|
| `lib/health.ts` | NEW — `computeHealthScore(device, telemetry, alarms): { score, label, color }` |
| `components/shared/HealthBadge.tsx` | NEW — badge component |
| `components/viewer/DeviceList.tsx` | Render `<HealthBadge />` on each device card |
| `components/viewer/DeviceDetail.tsx` | Show score in device header |
| `app/api/export/route.ts` | Add `health_score` column to CSV output |

### Acceptance criteria

- [ ] Device offline + 2 critical alarms → score ≤ 30, label "Poor", red badge
- [ ] Device with all green signals → score = 100, label "Excellent", green badge
- [ ] Health score column present in CSV export

---

## S2-3 · Audit Log

**Points:** 5 · **Priority:** High · **Status:** Backlog

**Goal:** Immutable per-org record of all user actions for compliance and debugging.

### Database migrations

```sql
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID REFERENCES profiles,
  actor_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      JSONB,
  org_id      UUID REFERENCES organizations,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY al_admin_all    ON audit_log FOR SELECT USING (is_admin());
CREATE POLICY al_manager_read ON audit_log FOR SELECT
  USING (org_id = current_org() AND current_role() = 'manager');
-- No UPDATE / DELETE policies — log is immutable
```

### Action catalog

| Action key | Trigger |
|------------|---------|
| `alarm.acknowledged` | User acknowledges an alarm |
| `alarm_rule.created` | Manager creates a threshold rule |
| `alarm_rule.deleted` | Manager deletes a threshold rule |
| `device.created` | Admin/manager adds a device |
| `device.updated` | Admin/manager edits a device |
| `device.deleted` | Admin/manager removes a device |
| `device.maintenance_on` | Maintenance mode enabled |
| `device.maintenance_off` | Maintenance mode disabled |
| `member.invited` | Invitation sent |
| `member.role_changed` | User's role updated |
| `member.deactivated` | User deactivated |
| `org.updated` | Org name or settings changed |
| `dashboard.layout_saved` | User saves a layout |
| `export.csv` | CSV downloaded |

### Files to create / modify

| File | Change |
|------|--------|
| `lib/audit.ts` | NEW — `writeAudit(action, targetType, targetId, detail, orgId)` helper |
| `components/admin/AuditLog.tsx` | NEW — filterable table (actor, action, date range) |
| `components/manager/OrgSettings.tsx` | Add Audit Log tab (own-org entries only) |
| All action-triggering locations | Call `writeAudit()` |

### Acceptance criteria

- [ ] Acknowledging an alarm creates an entry: actor email, action = `alarm.acknowledged`, alarm ID in detail
- [ ] Admin sees all orgs' logs; manager sees only own org
- [ ] No entry can be deleted through the UI

---

## S2-4 · Maintenance Mode

**Points:** 3 · **Priority:** Medium · **Status:** Backlog

**Goal:** Suppress alarms for a device while it is being serviced.

### Database migrations

```sql
ALTER TABLE devices ADD COLUMN maintenance_mode    BOOLEAN DEFAULT false;
ALTER TABLE devices ADD COLUMN maintenance_note    TEXT;
ALTER TABLE devices ADD COLUMN maintenance_until   TIMESTAMPTZ;
```

### Changes

- `app/api/ingest/route.ts` — skip all alarm evaluation when `devices.maintenance_mode = true`
- `components/viewer/DeviceList.tsx` — yellow "Maintenance" banner on card with countdown to `maintenance_until`
- `components/admin/DeviceConfiguration.tsx` — toggle switch + note field + optional end datetime
- Cron job: auto-clear `maintenance_mode` when `maintenance_until` passes

### Acceptance criteria

- [ ] Device in maintenance mode receives telemetry frames but raises zero alarms
- [ ] Countdown banner disappears when `maintenance_until` is reached and mode auto-clears
- [ ] Audit log entry created when maintenance mode is toggled on/off

---

## S2-5 · Production Totals KPI Cards

**Points:** 3 · **Priority:** Medium · **Status:** Backlog

**Goal:** Show cumulative production metrics at org and device level for the selected time range.

### Computed metrics

| Metric | Calculation |
|--------|-------------|
| Total flow volume (L) | `SUM(flow_rate) × avg_frame_interval_seconds / 60` |
| Total NaClO pumped (L) | `SUM(naclo_pumped)` |
| Avg active chlorine (mg/L) | `AVG(active_chlorine)` |
| Production uptime % | `COUNT(level_sensor_1=1) / COUNT(*) × 100` |

### Files to create / modify

| File | Change |
|------|--------|
| `components/shared/ProductionKpis.tsx` | NEW — 4-card horizontal strip, time range aware |
| `components/manager/ManagerDashboard.tsx` | Insert `<ProductionKpis />` above device list |
| `components/viewer/DeviceDetail.tsx` | Insert `<ProductionKpis deviceId={id} />` in summary section |

### Acceptance criteria

- [ ] Cards update when time range picker changes
- [ ] Device Detail shows device-scoped totals; Manager Dashboard shows org-wide totals

---

## Sprint 2 Summary

| Story | Points | Key new files |
|-------|--------|--------------|
| S2-1 Dashboard builder | 13 | `lib/widgets.ts`, `components/dashboard/*`, `app/api/layout/route.ts` |
| S2-2 Device health scoring | 5 | `lib/health.ts`, `components/shared/HealthBadge.tsx` |
| S2-3 Audit log | 5 | `lib/audit.ts`, `components/admin/AuditLog.tsx` |
| S2-4 Maintenance mode | 3 | DB migration + DeviceConfiguration changes |
| S2-5 Production totals | 3 | `components/shared/ProductionKpis.tsx` |
| **Total** | **29** | |

---

---

# Sprint 3 — Notifications & Analytics

**Dates:** Week 5–6  
**Goal:** Make alerts proactive; give users richer cross-device analysis tools.  
**Capacity:** 23 points

---

## S3-1 · Push Notifications — Browser

**Points:** 8 · **Priority:** High · **Status:** Backlog

**Goal:** Operators receive browser push notifications when an alarm fires, even with the tab in the background.

### Database migrations

```sql
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID REFERENCES profiles ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### New env vars

```env
VAPID_PUBLIC_KEY=<web-push public key>
VAPID_PRIVATE_KEY=<web-push private key>
VAPID_SUBJECT=mailto:admin@everspark.tech
```

### Files to create

| File | Description |
|------|-------------|
| `public/sw.js` | Service worker — listen for `push` events, show notification |
| `app/api/push/subscribe/route.ts` | POST — store subscription in `push_subscriptions` |
| `app/api/push/unsubscribe/route.ts` | DELETE — remove subscription |
| `app/api/push/send/route.ts` | POST (internal) — send notification via `web-push` library |
| `components/shared/NotificationBell.tsx` | Request permission UI, subscribe/unsubscribe toggle |
| `lib/push.ts` | `sendPushToOrg(orgId, payload)` helper |

### Ingest integration

`app/api/ingest/route.ts` — after inserting an alarm, call `sendPushToOrg()` for all subscribers in the device's org.

### Notification payload

```json
{
  "title": "EverSpark Alert — Node Alpha",
  "body": "Low pH: 6.0 mg/L (threshold < 6.5)",
  "icon": "/icon-192.png",
  "badge": "/badge-72.png",
  "data": { "alarm_id": "...", "device_id": "..." }
}
```

### Acceptance criteria

- [ ] User clicks notification bell → browser prompts for permission
- [ ] Alarm fires → notification arrives in < 5 s with device name and alarm detail
- [ ] Clicking notification deep-links to the device's detail view
- [ ] Unsubscribe removes endpoint from DB and stops notifications

---

## S3-2 · Push Notifications — SMS

**Points:** 5 · **Priority:** Medium · **Status:** Backlog

**Goal:** Critical alarms sent via SMS to registered phone numbers (Africa's Talking preferred for African deployments).

### Database migrations

```sql
ALTER TABLE profiles ADD COLUMN phone TEXT;
ALTER TABLE profiles ADD COLUMN sms_notify_critical BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN sms_notify_warning  BOOLEAN DEFAULT false;
```

### Files to create

| File | Description |
|------|-------------|
| `app/api/sms/send/route.ts` | POST (internal) — send via Africa's Talking / Twilio |
| `lib/sms.ts` | `sendSmsToOrg(orgId, severity, message)` helper |
| `components/shared/NotificationPreferences.tsx` | Phone number input + SMS toggle in profile settings |

### New env vars

```env
AT_API_KEY=<Africa's Talking API key>
AT_USERNAME=<sandbox or production username>
```

### Acceptance criteria

- [ ] User adds phone + enables critical SMS. Critical alarm fires → SMS received within 30 s.
- [ ] Warning-only SMS not sent when user has only critical enabled.

---

## S3-3 · Cross-Device Chart Comparison

**Points:** 5 · **Priority:** Medium · **Status:** Backlog

**Goal:** Overlay up to 3 devices' telemetry on shared axes for side-by-side analysis.

### Files to create / modify

| File | Change |
|------|--------|
| `components/shared/CompareChart.tsx` | NEW — multi-line Recharts, device-colour legend, parameter selector |
| `components/shared/DeviceMultiSelect.tsx` | NEW — searchable multi-select up to 3 devices |
| `components/manager/ManagerDashboard.tsx` | "Compare Devices" button → opens CompareChart panel |
| `components/admin/AdminDashboard.tsx` | Same |

### Parameters supported

`flow_rate` · `active_chlorine` · `ph_value` · `voltage` · `naclo_pumped`

### Acceptance criteria

- [ ] Select 2 devices, parameter = Flow Rate, range = Last 24 h → two coloured lines on one chart
- [ ] Up to 3 devices selectable; 4th device cannot be added
- [ ] Time range picker controls both series simultaneously

---

## S3-4 · Custom Roles & Permissions (Phase 2)

**Points:** 5 · **Priority:** High · **Status:** Backlog

**Goal:** Complete Phase 1 with role templates, permission inheritance, and manager-scoped role creation.

### Additions to Phase 1

- **Role templates** pre-seeded on first admin login:
  - "Read Only" — `devices:read`, `alarms:read`
  - "Field Technician" — `devices:read`, `alarms:read`, `alarms:acknowledge`
  - "Supervisor" — all manager permissions except `members:manage`
- **Permission inheritance** — custom role can `extends_role_id` (base role permissions are merged)
- **Manager-scoped role creation** — managers can create roles for their org but cannot grant permissions they don't hold themselves
- **Permission diff view** — when changing a user's role, show a modal listing gained/lost permissions

### Acceptance criteria

- [ ] Manager creates org-scoped role inheriting "Field Technician" + adds `reports:export`
- [ ] Manager cannot grant `members:manage` (they don't hold it)
- [ ] Role change modal shows diff before confirming

---

## Sprint 3 Summary

| Story | Points |
|-------|--------|
| S3-1 Push notifications — browser | 8 |
| S3-2 Push notifications — SMS | 5 |
| S3-3 Cross-device chart comparison | 5 |
| S3-4 Custom roles Phase 2 | 5 |
| **Total** | **23** |

---

---

# Sprint 4 — Reporting & Intelligence

**Dates:** Week 7–8  
**Goal:** Automate insight delivery; detect anomalies before operators notice.  
**Capacity:** 21 points

---

## S4-1 · Report Scheduling

**Points:** 8 · **Priority:** Medium · **Status:** Backlog

**Goal:** Managers automatically receive production summary reports by email on a daily or weekly schedule.

### Database migrations

```sql
CREATE TABLE report_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID REFERENCES profiles ON DELETE CASCADE,
  org_id      UUID REFERENCES organizations,
  frequency   TEXT NOT NULL CHECK (frequency IN ('daily','weekly')),
  format      TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','pdf')),
  last_sent   TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### New env vars

```env
RESEND_API_KEY=<Resend or SendGrid key>
FROM_EMAIL=reports@everspark.tech
```

### Files to create

| File | Description |
|------|-------------|
| `app/api/cron/reports/route.ts` | Nightly cron — find due schedules, generate, email |
| `app/api/reports/preview/route.ts` | GET — render report HTML (used by PDF generator) |
| `lib/report.ts` | `generateReportData(orgId, from, to)` — aggregates all metrics |
| `lib/email.ts` | `sendReportEmail(to, reportData, format)` |
| `components/manager/ReportSchedule.tsx` | Opt-in form: frequency, format, preview link |

### Report content

- Production totals (flow, NaClO, uptime %)
- Alarm summary (count by type and severity)
- Device health overview (score per device)
- Top 3 anomalies if anomaly detection is active (S4-2)

### Acceptance criteria

- [ ] Manager opts in to weekly report. Following Monday they receive an email with org summary.
- [ ] CSV attachment includes all production totals for the past 7 days
- [ ] Inactive schedule does not trigger email

---

## S4-2 · Trend Anomaly Detection

**Points:** 8 · **Priority:** Medium · **Status:** Backlog

**Goal:** Automatically flag readings that deviate significantly from a device's own rolling baseline.

### Algorithm

- Compute rolling 7-day mean (μ) and standard deviation (σ) per parameter per device
- On each ingest frame: `z = (value − μ) / σ`
- If `|z| > 3.0` → raise anomaly alarm
- **Learning period:** skip anomaly checks for first 48 h of device data
- **Debounce:** same parameter cannot raise anomaly alarm more than once per 30 min

### Database migrations

```sql
-- Cached rolling stats (updated on ingest, avoids re-scanning telemetry_data each frame)
CREATE TABLE device_param_stats (
  device_id  UUID REFERENCES devices ON DELETE CASCADE,
  parameter  TEXT NOT NULL,
  mean       NUMERIC NOT NULL,
  stddev     NUMERIC NOT NULL,
  sample_n   INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (device_id, parameter)
);
```

### Files to create / modify

| File | Change |
|------|--------|
| `lib/anomaly.ts` | NEW — `updateStats(deviceId, frame)`, `detectAnomalies(deviceId, frame, stats)` |
| `app/api/ingest/route.ts` | Call anomaly detection after threshold check; update `device_param_stats` |
| `lib/types.ts` | Add `'anomaly'` to `AlarmType`; add `z_score` field to `AlarmRecord` |

### Acceptance criteria

- [ ] Device sends 2 days of ~35 L/min flow, then 0 L/min → anomaly alarm fires with `z_score > 3`
- [ ] Device with < 48 h of data does not raise anomaly alarms
- [ ] Same parameter does not produce duplicate anomaly alarms within 30 min

---

## S4-3 · Production Uptime Analytics

**Points:** 5 · **Priority:** Medium · **Status:** Backlog

**Goal:** Per-device uptime percentage charted over time; exportable.

### New chart component

- `components/shared/UptimeChart.tsx` — daily bar chart of uptime % (frames with `level_sensor_1=1` / total frames × 100)
- Available in Device Detail view under a new "Analytics" tab
- Date range: 7 d / 30 d / 90 d selector

### Acceptance criteria

- [ ] Device Detail shows uptime % chart for last 30 days
- [ ] Each bar represents one calendar day
- [ ] Days with no data shown as grey / "no data"

---

## Sprint 4 Summary

| Story | Points |
|-------|--------|
| S4-1 Report scheduling | 8 |
| S4-2 Trend anomaly detection | 8 |
| S4-3 Production uptime analytics | 5 |
| **Total** | **21** |

---

---

# Sprint 5 — Platform & Mobile

**Dates:** Week 9–10  
**Goal:** Open the platform to integrations; make it usable in the field on a phone.  
**Capacity:** 21 points

---

## S5-1 · Mobile-Responsive Layout

**Points:** 13 · **Priority:** Medium · **Status:** Backlog

**Goal:** Full Viewer and Manager flows usable on a 375 px wide viewport with no horizontal scroll.

### Breakpoint strategy

| Breakpoint | Behaviour |
|------------|-----------|
| `< 640 px` (sm) | Single-column layout, collapsible nav drawer |
| `640–1024 px` (md) | Two-column grid, compact sidebar |
| `> 1024 px` (lg) | Current full desktop layout |

### Component changes

| Component | Change |
|-----------|--------|
| `components/layout/Sidebar.tsx` | Hamburger toggle on `< lg`; slide-in drawer overlay |
| `components/viewer/DeviceList.tsx` | `grid-cols-1` on sm, `grid-cols-2` on md |
| `components/viewer/DeviceDetail.tsx` | Stack charts vertically on sm; chart height 200 px |
| `components/shared/ProductionKpis.tsx` | 2-column grid on sm instead of 4-column |
| `components/dashboard/GridCanvas.tsx` | Fallback to vertical stack (no drag) on touch devices |
| All tables | Horizontal scroll with `overflow-x-auto` wrapper |
| All buttons / tap targets | Min 44 × 44 px via `min-h-[44px] min-w-[44px]` |

### Acceptance criteria

- [ ] Login → Dashboard → Device Detail → Alarm Acknowledge completes on 375 px Chrome DevTools mobile
- [ ] No horizontal scroll on any screen
- [ ] Navigation fully usable via hamburger menu on mobile
- [ ] Charts render at correct reduced height on small screens

---

## S5-2 · REST API Key Access

**Points:** 8 · **Priority:** Medium · **Status:** Backlog

**Goal:** Organizations pull their own telemetry via a versioned REST API using long-lived API keys.

### Database migrations

```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,  -- SHA-256 of raw key; raw key shown once on creation
  permissions TEXT[] NOT NULL,
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,           -- NULL = no expiry
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES profiles,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### API endpoints

| Method | Path | Auth scope |
|--------|------|-----------|
| GET | `/api/v1/devices` | `devices:read` |
| GET | `/api/v1/devices/:id` | `devices:read` |
| GET | `/api/v1/devices/:id/telemetry?from=&to=&limit=` | `devices:read` |
| GET | `/api/v1/alarms?from=&to=&acknowledged=` | `alarms:read` |
| POST | `/api/v1/alarms/:id/acknowledge` | `alarms:acknowledge` |

All endpoints:
- Auth: `Authorization: Bearer <raw_api_key>`
- Scope: always limited to the key's `org_id`
- Rate limit: 1000 requests / 24 h per key (tracked via `api_key_usage` counter in DB)
- Response format: JSON with `{ data, meta: { total, page } }`

### Files to create

| File | Description |
|------|-------------|
| `app/api/v1/devices/route.ts` | GET /api/v1/devices |
| `app/api/v1/devices/[id]/route.ts` | GET /api/v1/devices/:id |
| `app/api/v1/devices/[id]/telemetry/route.ts` | GET telemetry |
| `app/api/v1/alarms/route.ts` | GET alarms |
| `app/api/v1/alarms/[id]/acknowledge/route.ts` | POST acknowledge |
| `lib/api-auth.ts` | `authenticateApiKey(request): { org_id, permissions }` |
| `components/manager/ApiKeys.tsx` | Create / revoke keys, view permissions, last-used timestamp |

### Acceptance criteria

- [ ] Manager creates key with `devices:read`. `curl /api/v1/devices` with that key returns org devices.
- [ ] Key with only `devices:read` gets 403 on POST acknowledge.
- [ ] Revoked key returns 401 immediately.
- [ ] Key exceeding 1000 req/day returns 429.

---

## Sprint 5 Summary

| Story | Points |
|-------|--------|
| S5-1 Mobile-responsive layout | 13 |
| S5-2 REST API key access | 8 |
| **Total** | **21** |

---

---

# Sprint 6 — Polish & i18n

**Dates:** Week 11–12  
**Goal:** Production hardening, accessibility, and first localisation pass.  
**Capacity:** 16 points

---

## S6-1 · Multi-Language Support (i18n)

**Points:** 8 · **Priority:** Low · **Status:** Backlog

**Goal:** French and Portuguese locales selectable per user (relevant for francophone/lusophone African deployments).

### Library

`next-intl` — integrates with Next.js App Router, minimal bundle overhead.

### Database migration

```sql
ALTER TABLE profiles ADD COLUMN locale TEXT DEFAULT 'en' CHECK (locale IN ('en','fr','pt'));
```

### File structure

```
messages/
  en.json     ~300 string keys
  fr.json     French translations
  pt.json     Portuguese translations
```

### String scope

- All UI labels (nav, buttons, headings, table headers)
- Alarm type labels and severity labels
- Error messages and empty-state copy
- Email templates for reports and invitations
- Date/number formatting via `Intl.DateTimeFormat` / `Intl.NumberFormat`

### Files to create / modify

| File | Change |
|------|--------|
| `i18n.ts` | next-intl config |
| `middleware.ts` | Locale detection from profile preference |
| `messages/en.json` | Extract all English strings |
| `messages/fr.json` | French translations |
| `messages/pt.json` | Portuguese translations |
| `components/layout/UserMenu.tsx` | Locale switcher dropdown |

### Acceptance criteria

- [ ] User switches to French → all labels, buttons, and table headers render in French
- [ ] Alarm messages in notification push payload use selected locale
- [ ] Date formats use locale-appropriate format (DD/MM/YYYY for FR/PT)

---

## S6-2 · Performance Hardening & E2E Tests

**Points:** 8 · **Priority:** Medium · **Status:** Backlog

### Performance

| Task | Target |
|------|--------|
| `React.memo` chart components | Prevent re-render on unrelated state change |
| `useMemo` for filtered/sorted telemetry | Avoid re-sort on every keystroke |
| Virtualise telemetry table | `react-window` — render only visible rows (currently loads 200) |
| Loading skeletons | All async panels show skeleton before data arrives |
| Error boundaries | Each dashboard widget isolated; one crash doesn't blank the page |

### Security headers

Add to `next.config.js`:
```
Content-Security-Policy
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### E2E test suite (Playwright)

| Test | Scenario |
|------|---------|
| `auth.spec.ts` | Demo login as admin, manager, viewer |
| `alarms.spec.ts` | Simulate → alarm appears → acknowledge |
| `devices.spec.ts` | Create device, view telemetry, delete device |
| `export.spec.ts` | Trigger CSV download, verify filename |
| `roles.spec.ts` | Create custom role, assign to user, verify access |

### Acceptance criteria

- [ ] Telemetry table with 5000 rows scrolls without jank (60 fps)
- [ ] All 5 Playwright test files pass in CI
- [ ] CSP header present on all page responses
- [ ] No uncaught React render errors across the 5 main flows

---

## Sprint 6 Summary

| Story | Points |
|-------|--------|
| S6-1 Multi-language i18n | 8 |
| S6-2 Hardening & E2E tests | 8 |
| **Total** | **16** |

---

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Supabase RLS complexity grows with custom role tables | Medium | High | Write a `test-rls.sql` script; run it after every policy change |
| R2 | Dashboard builder drag UX unusable on mobile | High | Medium | Fall back to vertical reorder list on touch; no drag on `< lg` |
| R3 | Web Push not supported on iOS Safari < 16.4 | High | Medium | Graceful degradation: show in-app toast; SMS as secondary channel |
| R4 | PDF report cold-start on Vercel serverless | Medium | Low | Pre-render HTML only; let browser print-to-PDF; or use EC2 job |
| R5 | API rate limiting without Redis at scale | Low | Medium | Use Supabase atomic counter; revisit with Upstash Redis if > 10 orgs |
| R6 | i18n string extraction is incomplete | Medium | Low | Run `next-intl` extraction tool; block merge if keys missing |

---

## New Environment Variables (cumulative)

| Sprint | Variable | Used for |
|--------|----------|---------|
| S1-3 | `CRON_SECRET` | Authorise cron route calls |
| S3-1 | `VAPID_PUBLIC_KEY` | Web Push |
| S3-1 | `VAPID_PRIVATE_KEY` | Web Push |
| S3-1 | `VAPID_SUBJECT` | Web Push sender identity |
| S3-2 | `AT_API_KEY` | Africa's Talking SMS |
| S3-2 | `AT_USERNAME` | Africa's Talking account |
| S4-1 | `RESEND_API_KEY` | Transactional email |
| S4-1 | `FROM_EMAIL` | Report sender address |

---

## New Database Tables (cumulative)

| Sprint | Table | Purpose |
|--------|-------|---------|
| S1-1 | `roles` | Custom role definitions |
| S1-1 | `role_permissions` | Permission keys per role |
| S1-2 | `alarm_rules` | Manager-configured threshold rules |
| S2-1 | `dashboard_layouts` | Saved widget grid layouts |
| S2-3 | `audit_log` | Immutable action history |
| S3-1 | `push_subscriptions` | Web Push endpoint storage |
| S4-1 | `report_schedules` | Scheduled report preferences |
| S4-2 | `device_param_stats` | Rolling mean/stddev for anomaly detection |
| S5-2 | `api_keys` | Long-lived org API keys |

---

*Last updated: 2026-06-17*
