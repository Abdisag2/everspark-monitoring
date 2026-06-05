-- ============================================================================
-- Ever Spark Monitoring — Supabase schema, RLS policies & ingest helpers
-- Multi-tenant IoT platform for Clara chlorine-production field nodes.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. organizations
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. profiles  (1-1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email           text not null,
  name            text not null default '',
  role            text not null default 'viewer' check (role in ('admin','manager','viewer')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. devices
-- ----------------------------------------------------------------------------
create table if not exists public.devices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  secret_token    text not null unique,
  status          text not null default 'offline' check (status in ('online','offline')),
  last_seen       timestamptz,
  location        text,
  system_id       text,
  created_at      timestamptz not null default now()
);
create index if not exists devices_org_idx   on public.devices(organization_id);
create index if not exists devices_token_idx  on public.devices(secret_token);

-- ----------------------------------------------------------------------------
-- 4. telemetry_data
-- ----------------------------------------------------------------------------
create table if not exists public.telemetry_data (
  id              bigint generated always as identity primary key,
  device_id       uuid not null references public.devices(id) on delete cascade,
  flow_rate       numeric(6,1) not null default 0,   -- P1 L/min
  voltage         numeric(5,1) not null default 0,   -- P2 V
  level_sensor_1  smallint not null default 0,       -- P3 0|1
  level_sensor_2  smallint not null default 0,       -- P4 0|1
  level_sensor_3  smallint not null default 0,       -- P5 0|1
  naclo_pumped    numeric(8,1) not null default 0,   -- P6 L
  target_frc      numeric(4,1) not null default 0,   -- P7 mg/L
  active_chlorine numeric(4,1) not null default 0,   -- P8 mg/L
  ph_value        numeric(4,1) not null default 0,   -- P9
  timestamp       timestamptz not null default now()
);
create index if not exists telemetry_device_ts_idx on public.telemetry_data(device_id, timestamp desc);

-- ----------------------------------------------------------------------------
-- 5. alarms  (raised server-side by the ingest endpoint on hardware events)
-- ----------------------------------------------------------------------------
create table if not exists public.alarms (
  id            uuid primary key default gen_random_uuid(),
  device_id     uuid not null references public.devices(id) on delete cascade,
  alarm_type    text not null check (alarm_type in ('production_complete','no_naclo')),
  message       text not null,
  acknowledged  boolean not null default false,
  timestamp     timestamptz not null default now()
);
create index if not exists alarms_device_idx on public.alarms(device_id, timestamp desc);

-- ============================================================================
-- Helper functions  (SECURITY DEFINER to avoid recursive RLS on profiles)
-- ============================================================================
create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.organizations  enable row level security;
alter table public.profiles        enable row level security;
alter table public.devices         enable row level security;
alter table public.telemetry_data  enable row level security;
alter table public.alarms          enable row level security;

-- ---- organizations ----------------------------------------------------------
-- Admin: everything. Manager/Viewer: SELECT only their own org.
create policy org_admin_all on public.organizations
  for all using (public.is_admin()) with check (public.is_admin());
create policy org_member_select on public.organizations
  for select using (id = public.current_org());
-- Managers may UPDATE their own org details (name).
create policy org_manager_update on public.organizations
  for update using (public.current_role() = 'manager' and id = public.current_org())
  with check (id = public.current_org());

-- ---- profiles ---------------------------------------------------------------
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
-- Read own org's profiles.
create policy profiles_member_select on public.profiles
  for select using (organization_id = public.current_org());
-- Managers CRUD profiles in their own org, but may NOT create/elevate to admin.
create policy profiles_manager_insert on public.profiles
  for insert with check (
    public.current_role() = 'manager'
    and organization_id = public.current_org()
    and role <> 'admin'
  );
create policy profiles_manager_update on public.profiles
  for update using (
    public.current_role() = 'manager'
    and organization_id = public.current_org()
    and role <> 'admin'
  ) with check (
    organization_id = public.current_org()
    and role <> 'admin'        -- block elevation to admin
  );
create policy profiles_manager_delete on public.profiles
  for delete using (
    public.current_role() = 'manager'
    and organization_id = public.current_org()
    and role <> 'admin'
  );

-- ---- devices ----------------------------------------------------------------
create policy devices_admin_all on public.devices
  for all using (public.is_admin()) with check (public.is_admin());
-- Read own org's devices.
create policy devices_member_select on public.devices
  for select using (organization_id = public.current_org());
-- Managers CRUD devices in their own org.
create policy devices_manager_cud on public.devices
  for all using (
    public.current_role() = 'manager' and organization_id = public.current_org()
  ) with check (
    public.current_role() = 'manager' and organization_id = public.current_org()
  );

-- ---- telemetry_data ---------------------------------------------------------
create policy telemetry_admin_all on public.telemetry_data
  for all using (public.is_admin()) with check (public.is_admin());
-- Members read telemetry for devices in their org.
create policy telemetry_member_select on public.telemetry_data
  for select using (
    exists (
      select 1 from public.devices d
      where d.id = telemetry_data.device_id
        and d.organization_id = public.current_org()
    )
  );
-- NOTE: hardware ingest writes via the service-role key in /api/ingest, which
-- bypasses RLS. No anon INSERT policy is granted on telemetry_data on purpose.

-- ---- alarms -----------------------------------------------------------------
create policy alarms_admin_all on public.alarms
  for all using (public.is_admin()) with check (public.is_admin());
-- Members read alarms for devices in their org.
create policy alarms_member_select on public.alarms
  for select using (
    exists (
      select 1 from public.devices d
      where d.id = alarms.device_id and d.organization_id = public.current_org()
    )
  );
-- Members may acknowledge (update) alarms for their org's devices.
create policy alarms_member_ack on public.alarms
  for update using (
    exists (
      select 1 from public.devices d
      where d.id = alarms.device_id and d.organization_id = public.current_org()
    )
  ) with check (
    exists (
      select 1 from public.devices d
      where d.id = alarms.device_id and d.organization_id = public.current_org()
    )
  );
-- Alarms are raised server-side via the service-role key (ingest), bypassing RLS.

-- ============================================================================
-- Auto-create a profile row when a new auth user signs up
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
