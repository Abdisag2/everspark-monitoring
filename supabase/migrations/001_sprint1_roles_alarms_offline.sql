-- =============================================================================
-- Migration 001 — Sprint 1: Roles, Alarm Rules, Offline Detection
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ROLES  — custom role definitions (org-scoped or platform-wide)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  org_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. ROLE_PERMISSIONS  — permission keys per role
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id    UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- ---------------------------------------------------------------------------
-- 3. PROFILES  — link to a custom role
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.roles(id);

-- ---------------------------------------------------------------------------
-- 4. ALARM_RULES  — manager-configured threshold alert rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alarm_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id   UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  parameter   TEXT NOT NULL CHECK (parameter IN (
    'flow_rate','voltage','ph_value','active_chlorine',
    'naclo_pumped','target_frc','level_sensor_1','level_sensor_2','level_sensor_3'
  )),
  condition   TEXT NOT NULL CHECK (condition IN ('lt','lte','gt','gte','eq')),
  threshold   NUMERIC NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  label       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alarm_rules_org_idx    ON public.alarm_rules(org_id);
CREATE INDEX IF NOT EXISTS alarm_rules_device_idx ON public.alarm_rules(device_id);

-- ---------------------------------------------------------------------------
-- 5. ALARMS  — extend existing table for threshold breaches & offline events
-- ---------------------------------------------------------------------------
ALTER TABLE public.alarms
  ADD COLUMN IF NOT EXISTS severity  TEXT CHECK (severity IN ('info','warning','critical')),
  ADD COLUMN IF NOT EXISTS rule_id   UUID REFERENCES public.alarm_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parameter TEXT,
  ADD COLUMN IF NOT EXISTS value     NUMERIC;

-- Widen the alarm_type constraint to include the three new types.
-- Drop the old constraint first (it only existed if the table was created with it).
ALTER TABLE public.alarms DROP CONSTRAINT IF EXISTS alarms_alarm_type_check;
ALTER TABLE public.alarms
  ADD CONSTRAINT alarms_alarm_type_check CHECK (alarm_type IN (
    'production_complete',
    'no_naclo',
    'threshold_breach',
    'device_offline',
    'device_reconnected'
  ));

-- ---------------------------------------------------------------------------
-- 6. DEVICES  — configurable offline threshold per device
-- ---------------------------------------------------------------------------
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS offline_threshold_minutes INT NOT NULL DEFAULT 15;

-- ---------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_admin_all   ON public.roles;
DROP POLICY IF EXISTS roles_member_read ON public.roles;

CREATE POLICY roles_admin_all ON public.roles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY roles_member_read ON public.roles
  FOR SELECT USING (org_id = public.current_org() OR org_id IS NULL);

-- role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_admin_all   ON public.role_permissions;
DROP POLICY IF EXISTS rp_member_read ON public.role_permissions;

CREATE POLICY rp_admin_all ON public.role_permissions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rp_member_read ON public.role_permissions
  FOR SELECT USING (
    role_id IN (
      SELECT id FROM public.roles
      WHERE org_id = public.current_org() OR org_id IS NULL
    )
  );

-- alarm_rules
ALTER TABLE public.alarm_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_admin_all     ON public.alarm_rules;
DROP POLICY IF EXISTS ar_manager_all   ON public.alarm_rules;
DROP POLICY IF EXISTS ar_member_select ON public.alarm_rules;

CREATE POLICY ar_admin_all ON public.alarm_rules
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ar_manager_all ON public.alarm_rules
  FOR ALL
  USING  (org_id = public.current_org() AND public.current_role() = 'manager')
  WITH CHECK (org_id = public.current_org() AND public.current_role() = 'manager');

CREATE POLICY ar_member_select ON public.alarm_rules
  FOR SELECT USING (org_id = public.current_org());

-- ---------------------------------------------------------------------------
-- 8. HELPER: current_role() conflicts with a Postgres built-in — rename ours
--    Only needed if the function was created without a schema prefix.
--    Already defined as public.current_role() in the base schema — no change.
-- ---------------------------------------------------------------------------

-- Done.
