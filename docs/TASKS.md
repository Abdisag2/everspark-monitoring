# EverSpark Monitoring — Task Board

**Project:** EverSpark Monitoring Platform  
**Updated:** 2026-06-17 (Sprint 1 complete)  
**Format:** `ES-<sprint><story><task>` (e.g. ES-1101 = Sprint 1, Story 1, Task 01)

Status legend: `[ ]` Backlog · `[~]` In Progress · `[x]` Done · `[!]` Blocked

---

## Sprint 1 — Foundation & Critical Ops (Weeks 1–2)

### Story S1-1 · Custom Roles & Granular Permissions (Phase 1) · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-1101 | Create `roles` table with RLS policies | fitse-yotor | [x] |
| ES-1102 | Create `role_permissions` table with RLS policies | fitse-yotor | [x] |
| ES-1103 | Add `custom_role_id` column to `profiles` table | fitse-yotor | [x] |
| ES-1104 | Write `lib/permissions.ts` — `hasPermission(user, key)` helper | fitse-yotor | [x] |
| ES-1105 | Update `AppContext.tsx` to load custom role and resolve permissions on login | fitse-yotor | [x] |
| ES-1106 | Add `Permission`, `Role`, `RolePermission` types to `lib/types.ts` | fitse-yotor | [x] |
| ES-1107 | Build `components/admin/RoleManager.tsx` — role list, create, edit, delete | fitse-yotor | [x] |
| ES-1108 | Build permission checkbox grid in RoleManager | fitse-yotor | [x] |
| ES-1109 | Register roles/alarm-rules panel views in `app/dashboard/page.tsx` | fitse-yotor | [x] |
| ES-1110 | Add "Roles & Permissions" nav item in admin sidebar | fitse-yotor | [x] |
| ES-1111 | Seed default permission sets for `admin / manager / viewer` base roles | fitse-yotor | [x] |
| ES-1112 | Write unit tests for `hasPermission()` covering all 12 permission keys | — | [ ] |

### Story S1-2 · Threshold-Based Configurable Alarms · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-1201 | Create `alarm_rules` table with RLS policies | fitse-yotor | [x] |
| ES-1202 | Extend `AlarmType` in `lib/types.ts` — add `'threshold_breach'` | fitse-yotor | [x] |
| ES-1203 | Add `severity`, `rule_id`, `parameter`, `value` fields to `AlarmRecord` type | fitse-yotor | [x] |
| ES-1204 | Implement threshold evaluation block in `app/api/ingest/route.ts` | fitse-yotor | [x] |
| ES-1205 | Add 1-hour debounce for threshold alarms in ingest route | fitse-yotor | [x] |
| ES-1206 | Build `components/manager/AlarmRules.tsx` — list existing rules | fitse-yotor | [x] |
| ES-1207 | Build create/edit rule form in AlarmRules (parameter, condition, threshold, severity, label) | fitse-yotor | [x] |
| ES-1208 | Build delete rule action with confirmation dialog | fitse-yotor | [x] |
| ES-1209 | Build `components/shared/AlarmBadge.tsx` — colour-coded severity chip | fitse-yotor | [x] |
| ES-1210 | Update AdminDashboard alarm cards to show severity badge and parameter value | fitse-yotor | [x] |
| ES-1211 | Update ManagerDashboard alarm cards with same changes | fitse-yotor | [x] |

### Story S1-3 · Offline / Reconnect Detection · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-1301 | Add `offline_threshold_minutes` column to `devices` table | fitse-yotor | [x] |
| ES-1302 | Add `'device_offline'` and `'device_reconnected'` to `AlarmType` | fitse-yotor | [x] |
| ES-1303 | Create `app/api/cron/device-status/route.ts` — offline flip logic | fitse-yotor | [x] |
| ES-1304 | Add reconnect detection and `device_reconnected` alarm in cron route | fitse-yotor | [x] |
| ES-1305 | Add cron schedule entry to `vercel.json` (every 5 min) | fitse-yotor | [x] |
| ES-1306 | Add `CRON_SECRET` env var check to cron route (reject unauthorised calls) | fitse-yotor | [x] |
| ES-1307 | Add pulsing red ring to device card in `components/viewer/DeviceList.tsx` when offline | fitse-yotor | [x] |
| ES-1308 | Build `components/shared/ToastProvider.tsx` and wire into app layout | fitse-yotor | [x] |
| ES-1309 | Show toast when a device flips offline during an active session | — | [ ] |

### Story S1-4 · Bulk CSV Export · 3 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-1401 | Create `app/api/export/route.ts` — stream CSV with `device_name` prefix column | fitse-yotor | [x] |
| ES-1402 | Enforce RLS in export route (managers can only export own org) | fitse-yotor | [x] |
| ES-1403 | Add "Export All Devices" button to ManagerDashboard | fitse-yotor | [x] |
| ES-1404 | Add per-org export button to OrganizationManagement panel (admin) | — | [ ] |

---

## Sprint 2 — Dashboard Builder & Operational Intelligence (Weeks 3–4)

### Story S2-1 · Dashboard Builder · 13 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-2101 | Create `dashboard_layouts` table with RLS (owner-only) | — | [ ] |
| ES-2102 | Write `lib/widgets.ts` — widget registry with ID, name, min size, allowed roles | — | [ ] |
| ES-2103 | Define `WidgetConfig`, `LayoutItem`, `DashboardLayout` types in `lib/types.ts` | — | [ ] |
| ES-2104 | Create `app/api/layout/route.ts` — GET (load layout), POST (save layout), DELETE | — | [ ] |
| ES-2105 | Build `components/dashboard/GridCanvas.tsx` — 12-column CSS Grid with drag zones | — | [ ] |
| ES-2106 | Implement HTML5 Drag API for widget placement on GridCanvas | — | [ ] |
| ES-2107 | Implement resize handles on widgets (drag right/bottom edge) | — | [ ] |
| ES-2108 | Build `components/dashboard/WidgetPalette.tsx` — filtered by current user role | — | [ ] |
| ES-2109 | Build `components/dashboard/WidgetRenderer.tsx` — switch on `widget_id` | — | [ ] |
| ES-2110 | Build `components/dashboard/DashboardToolbar.tsx` — Edit / Save / Reset / New | — | [ ] |
| ES-2111 | Build `components/dashboard/DashboardPage.tsx` — orchestrate all sub-components | — | [ ] |
| ES-2112 | Replace static AdminDashboard / ManagerDashboard / DeviceList with DashboardPage | — | [ ] |
| ES-2113 | Seed default layouts for admin, manager, viewer roles | — | [ ] |
| ES-2114 | Implement "New Dashboard" flow with name input | — | [ ] |
| ES-2115 | Implement "Reset to Default" with confirmation dialog | — | [ ] |

### Story S2-2 · Device Health Scoring · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-2201 | Write `lib/health.ts` — `computeHealthScore(device, telemetry, alarms)` | — | [ ] |
| ES-2202 | Define score thresholds: Excellent ≥90, Good ≥70, Fair ≥50, Poor <50 | — | [ ] |
| ES-2203 | Build `components/shared/HealthBadge.tsx` — colour-coded label + score | — | [ ] |
| ES-2204 | Render HealthBadge on each device card in DeviceList | — | [ ] |
| ES-2205 | Render HealthBadge in DeviceDetail header | — | [ ] |
| ES-2206 | Add `health_score` column to bulk CSV export output | — | [ ] |
| ES-2207 | Add fleet average health KPI widget to widget registry | — | [ ] |

### Story S2-3 · Audit Log · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-2301 | Create `audit_log` table (immutable — no UPDATE/DELETE RLS) | — | [ ] |
| ES-2302 | Write `lib/audit.ts` — `writeAudit(action, targetType, targetId, detail, orgId)` | — | [ ] |
| ES-2303 | Instrument `alarm.acknowledged` action | — | [ ] |
| ES-2304 | Instrument `device.created / updated / deleted` actions | — | [ ] |
| ES-2305 | Instrument `member.invited / role_changed / deactivated` actions | — | [ ] |
| ES-2306 | Instrument `org.updated`, `dashboard.layout_saved`, `export.csv` actions | — | [ ] |
| ES-2307 | Build `components/admin/AuditLog.tsx` — filterable table (actor, action, date) | — | [ ] |
| ES-2308 | Add Audit Log tab to manager's OrgSettings panel (own-org entries) | — | [ ] |

### Story S2-4 · Maintenance Mode · 3 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-2401 | Add `maintenance_mode`, `maintenance_note`, `maintenance_until` columns to `devices` | — | [ ] |
| ES-2402 | Skip alarm evaluation in ingest route when `maintenance_mode = true` | — | [ ] |
| ES-2403 | Add maintenance toggle + note + end-datetime to DeviceConfiguration panel | — | [ ] |
| ES-2404 | Render yellow "Maintenance" banner with countdown on device card | — | [ ] |
| ES-2405 | Add cron task to auto-clear `maintenance_mode` when `maintenance_until` passes | — | [ ] |

### Story S2-5 · Production Totals KPI Cards · 3 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-2501 | Build `components/shared/ProductionKpis.tsx` — 4 KPI cards, time-range aware | — | [ ] |
| ES-2502 | Wire flow volume, NaClO pumped, avg chlorine, uptime % calculations | — | [ ] |
| ES-2503 | Render ProductionKpis in ManagerDashboard header | — | [ ] |
| ES-2504 | Render ProductionKpis (device-scoped) in DeviceDetail summary section | — | [ ] |

---

## Sprint 3 — Notifications & Analytics (Weeks 5–6)

### Story S3-1 · Push Notifications — Browser · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-3101 | Create `push_subscriptions` table | — | [ ] |
| ES-3102 | Generate VAPID key pair; add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to env | — | [ ] |
| ES-3103 | Create `public/sw.js` — service worker to receive push events and show notification | — | [ ] |
| ES-3104 | Register service worker on app load (`lib/push-client.ts`) | — | [ ] |
| ES-3105 | Create `app/api/push/subscribe/route.ts` — store subscription | — | [ ] |
| ES-3106 | Create `app/api/push/unsubscribe/route.ts` — remove subscription | — | [ ] |
| ES-3107 | Create `app/api/push/send/route.ts` — internal send via `web-push` library | — | [ ] |
| ES-3108 | Write `lib/push.ts` — `sendPushToOrg(orgId, payload)` | — | [ ] |
| ES-3109 | Call `sendPushToOrg()` in ingest route after alarm insert | — | [ ] |
| ES-3110 | Build `components/shared/NotificationBell.tsx` — permission request + subscribe toggle | — | [ ] |
| ES-3111 | Add NotificationBell to layout header | — | [ ] |
| ES-3112 | Service worker click handler deep-links to device detail view | — | [ ] |

### Story S3-2 · Push Notifications — SMS · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-3201 | Add `phone`, `sms_notify_critical`, `sms_notify_warning` columns to `profiles` | — | [ ] |
| ES-3202 | Add `AT_API_KEY` and `AT_USERNAME` env vars | — | [ ] |
| ES-3203 | Write `lib/sms.ts` — `sendSmsToOrg(orgId, severity, message)` | — | [ ] |
| ES-3204 | Create `app/api/sms/send/route.ts` — internal SMS dispatch | — | [ ] |
| ES-3205 | Call SMS send in ingest route when alarm severity matches subscriber preference | — | [ ] |
| ES-3206 | Build `components/shared/NotificationPreferences.tsx` — phone input + SMS toggle | — | [ ] |
| ES-3207 | Add Notification Preferences to user profile settings panel | — | [ ] |

### Story S3-3 · Cross-Device Chart Comparison · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-3301 | Build `components/shared/DeviceMultiSelect.tsx` — searchable, max 3 devices | — | [ ] |
| ES-3302 | Build `components/shared/CompareChart.tsx` — multi-line Recharts, device-colour legend | — | [ ] |
| ES-3303 | Add parameter selector (flow_rate, active_chlorine, ph_value, voltage, naclo_pumped) | — | [ ] |
| ES-3304 | Wire time range picker to both chart series | — | [ ] |
| ES-3305 | Add "Compare Devices" button + panel to ManagerDashboard | — | [ ] |
| ES-3306 | Add same panel to AdminDashboard | — | [ ] |

### Story S3-4 · Custom Roles & Permissions (Phase 2) · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-3401 | Seed role templates: "Read Only", "Field Technician", "Supervisor" on first admin login | — | [ ] |
| ES-3402 | Add `extends_role_id` column to `roles` table for permission inheritance | — | [ ] |
| ES-3403 | Update `hasPermission()` to merge inherited permissions | — | [ ] |
| ES-3404 | Allow managers to create org-scoped roles (enforce they cannot grant permissions they lack) | — | [ ] |
| ES-3405 | Build permission diff modal — show gained/lost permissions on role change | — | [ ] |

---

## Sprint 4 — Reporting & Intelligence (Weeks 7–8)

### Story S4-1 · Report Scheduling · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-4101 | Create `report_schedules` table | — | [ ] |
| ES-4102 | Add `RESEND_API_KEY` and `FROM_EMAIL` env vars | — | [ ] |
| ES-4103 | Write `lib/report.ts` — `generateReportData(orgId, from, to)` aggregation | — | [ ] |
| ES-4104 | Write `lib/email.ts` — `sendReportEmail(to, reportData, format)` via Resend | — | [ ] |
| ES-4105 | Create `app/api/reports/preview/route.ts` — render report as HTML | — | [ ] |
| ES-4106 | Create `app/api/cron/reports/route.ts` — find due schedules, generate, send | — | [ ] |
| ES-4107 | Add cron entry to `vercel.json` for nightly report job | — | [ ] |
| ES-4108 | Build `components/manager/ReportSchedule.tsx` — opt-in form, frequency, format, preview | — | [ ] |
| ES-4109 | Add ReportSchedule panel to manager OrgSettings | — | [ ] |

### Story S4-2 · Trend Anomaly Detection · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-4201 | Create `device_param_stats` table for cached rolling mean/stddev | — | [ ] |
| ES-4202 | Add `'anomaly'` to `AlarmType`; add `z_score` to `AlarmRecord` | — | [ ] |
| ES-4203 | Write `lib/anomaly.ts` — `updateStats(deviceId, frame)` | — | [ ] |
| ES-4204 | Write `lib/anomaly.ts` — `detectAnomalies(deviceId, frame, stats)` returning breaches | — | [ ] |
| ES-4205 | Add 48-hour learning period check (skip if device has < 48 h of data) | — | [ ] |
| ES-4206 | Add 30-minute debounce per parameter per device | — | [ ] |
| ES-4207 | Call anomaly detection in ingest route after threshold check | — | [ ] |
| ES-4208 | Show "Anomaly" tag + z-score in alarm detail on AdminDashboard | — | [ ] |

### Story S4-3 · Production Uptime Analytics · 5 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-4301 | Build `components/shared/UptimeChart.tsx` — daily bar chart of uptime % | — | [ ] |
| ES-4302 | Compute uptime % per day: `level_sensor_1=1 frames / total frames × 100` | — | [ ] |
| ES-4303 | Add 7d / 30d / 90d range selector to UptimeChart | — | [ ] |
| ES-4304 | Add "Analytics" tab to DeviceDetail view | — | [ ] |
| ES-4305 | Render UptimeChart under Analytics tab | — | [ ] |

---

## Sprint 5 — Platform & Mobile (Weeks 9–10)

### Story S5-1 · Mobile-Responsive Layout · 13 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-5101 | Audit all components for fixed `px` widths; list violations | — | [ ] |
| ES-5102 | Convert Sidebar to collapsible drawer on `< lg` breakpoint | — | [ ] |
| ES-5103 | Add hamburger toggle button to top nav on mobile | — | [ ] |
| ES-5104 | Update DeviceList to `grid-cols-1` on sm, `grid-cols-2` on md | — | [ ] |
| ES-5105 | Stack DeviceDetail charts vertically on sm; reduce height to 200 px | — | [ ] |
| ES-5106 | Update ProductionKpis to 2-column grid on sm | — | [ ] |
| ES-5107 | Add `overflow-x-auto` wrapper to all data tables | — | [ ] |
| ES-5108 | Ensure all interactive targets meet 44×44 px minimum | — | [ ] |
| ES-5109 | DashboardBuilder: disable drag on touch; fall back to vertical reorder list | — | [ ] |
| ES-5110 | Update AlarmRules form layout for mobile | — | [ ] |
| ES-5111 | Test full login → dashboard → device detail → alarm ack flow at 375 px | — | [ ] |
| ES-5112 | Test on iOS Safari (375 px) and Android Chrome (360 px) | — | [ ] |
| ES-5113 | Fix any regressions found in mobile testing | — | [ ] |

### Story S5-2 · REST API Key Access · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-5201 | Create `api_keys` table | — | [ ] |
| ES-5202 | Write `lib/api-auth.ts` — `authenticateApiKey(request)` — hash key, look up, check active | — | [ ] |
| ES-5203 | Implement rate limiting (1000 req/day counter in DB) | — | [ ] |
| ES-5204 | Create `app/api/v1/devices/route.ts` — GET device list | — | [ ] |
| ES-5205 | Create `app/api/v1/devices/[id]/route.ts` — GET single device | — | [ ] |
| ES-5206 | Create `app/api/v1/devices/[id]/telemetry/route.ts` — paginated telemetry | — | [ ] |
| ES-5207 | Create `app/api/v1/alarms/route.ts` — GET alarms with filters | — | [ ] |
| ES-5208 | Create `app/api/v1/alarms/[id]/acknowledge/route.ts` — POST acknowledge | — | [ ] |
| ES-5209 | Build `components/manager/ApiKeys.tsx` — create key (show raw key once), revoke, view last-used | — | [ ] |
| ES-5210 | Add ApiKeys panel to manager OrgSettings | — | [ ] |

---

## Sprint 6 — Polish & i18n (Weeks 11–12)

### Story S6-1 · Multi-Language Support (i18n) · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-6101 | Add `locale` column to `profiles` table | — | [ ] |
| ES-6102 | Install and configure `next-intl` | — | [ ] |
| ES-6103 | Create `middleware.ts` for locale detection from profile preference | — | [ ] |
| ES-6104 | Extract all English strings to `messages/en.json` (~300 keys) | — | [ ] |
| ES-6105 | Translate to French — `messages/fr.json` | — | [ ] |
| ES-6106 | Translate to Portuguese — `messages/pt.json` | — | [ ] |
| ES-6107 | Apply `Intl.DateTimeFormat` for locale-aware date rendering | — | [ ] |
| ES-6108 | Apply `Intl.NumberFormat` for locale-aware number rendering | — | [ ] |
| ES-6109 | Add locale switcher dropdown to `components/layout/UserMenu.tsx` | — | [ ] |
| ES-6110 | Translate push notification payloads using user's locale | — | [ ] |
| ES-6111 | Translate report email templates | — | [ ] |

### Story S6-2 · Performance Hardening & E2E Tests · 8 pts

| Task ID | Task | Assignee | Status |
|---------|------|----------|--------|
| ES-6201 | Add `React.memo` to all chart components | — | [ ] |
| ES-6202 | Add `useMemo` for filtered/sorted telemetry arrays in DeviceDetail | — | [ ] |
| ES-6203 | Install `react-window`; virtualise telemetry table (currently loads 200 rows) | — | [ ] |
| ES-6204 | Add loading skeletons to all async panels (devices, alarms, telemetry) | — | [ ] |
| ES-6205 | Wrap each dashboard widget in a React Error Boundary | — | [ ] |
| ES-6206 | Add CSP, `X-Frame-Options`, `X-Content-Type-Options` headers to `next.config.js` | — | [ ] |
| ES-6207 | Add `robots.txt` and `security.txt` to `public/` | — | [ ] |
| ES-6208 | Set up Playwright config and write `auth.spec.ts` — login flows for all 3 roles | — | [ ] |
| ES-6209 | Write `alarms.spec.ts` — simulate frame → alarm appears → acknowledge | — | [ ] |
| ES-6210 | Write `devices.spec.ts` — create device, view telemetry, delete | — | [ ] |
| ES-6211 | Write `export.spec.ts` — trigger CSV download, verify filename | — | [ ] |
| ES-6212 | Write `roles.spec.ts` — create custom role, assign, verify access restriction | — | [ ] |
| ES-6213 | Run full test suite; fix any failures | — | [ ] |

---

## Task Count Summary

| Sprint | Stories | Tasks | Points |
|--------|---------|-------|--------|
| S1 | 4 | 36 | 24 |
| S2 | 5 | 39 | 29 |
| S3 | 4 | 30 | 23 |
| S4 | 3 | 22 | 21 |
| S5 | 2 | 23 | 21 |
| S6 | 2 | 24 | 16 |
| **Total** | **20** | **174** | **134** |

---

*See [SPRINT_PLAN.md](./SPRINT_PLAN.md) for full feature specs, DB schemas, and acceptance criteria per story.*  
*Last updated: 2026-06-17*
