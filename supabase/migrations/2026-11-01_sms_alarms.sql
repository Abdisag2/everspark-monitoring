-- ============================================================================
-- Phase 2 — SMS alarm notifications (with Super-Admin approval workflow)
-- Run in the Supabase SQL editor.
-- ============================================================================

-- 1. Per-org SMS feature state (requested by a manager, approved by an admin).
create table if not exists public.org_sms_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status       text not null default 'none' check (status in ('none','pending','approved','denied')),
  enabled      boolean not null default false,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  updated_at   timestamptz not null default now()
);

-- 2. Operator phone numbers that receive SMS for an org (E.164, e.g. +2519...).
create table if not exists public.sms_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text not null,
  label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sms_recipients_org_idx on public.sms_recipients(organization_id);

-- 3. SMS message template per alarm type per org ({device},{detail},{time},{alarm}).
create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alarm_type text not null check (alarm_type in ('production_complete','no_naclo')),
  message text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, alarm_type)
);
create index if not exists sms_templates_org_idx on public.sms_templates(organization_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.org_sms_settings enable row level security;
alter table public.sms_recipients   enable row level security;
alter table public.sms_templates    enable row level security;

-- org_sms_settings: admins manage all; members read their own org. State
-- transitions happen ONLY through the RPCs below (no direct manager writes).
create policy org_sms_admin_all on public.org_sms_settings
  for all using (public.is_admin()) with check (public.is_admin());
create policy org_sms_member_select on public.org_sms_settings
  for select using (organization_id = public.current_org());

-- sms_recipients / sms_templates: admins all; members read own org; managers
-- may CUD their own org's rows ONLY while SMS is enabled for that org.
create policy sms_rcpt_admin_all on public.sms_recipients
  for all using (public.is_admin()) with check (public.is_admin());
create policy sms_rcpt_member_select on public.sms_recipients
  for select using (organization_id = public.current_org());
create policy sms_rcpt_manager_cud on public.sms_recipients
  for all using (
    public.current_role() = 'manager' and organization_id = public.current_org()
    and exists (select 1 from public.org_sms_settings s
                where s.organization_id = public.current_org() and s.enabled)
  ) with check (
    public.current_role() = 'manager' and organization_id = public.current_org()
    and exists (select 1 from public.org_sms_settings s
                where s.organization_id = public.current_org() and s.enabled)
  );

create policy sms_tmpl_admin_all on public.sms_templates
  for all using (public.is_admin()) with check (public.is_admin());
create policy sms_tmpl_member_select on public.sms_templates
  for select using (organization_id = public.current_org());
create policy sms_tmpl_manager_cud on public.sms_templates
  for all using (
    public.current_role() = 'manager' and organization_id = public.current_org()
    and exists (select 1 from public.org_sms_settings s
                where s.organization_id = public.current_org() and s.enabled)
  ) with check (
    public.current_role() = 'manager' and organization_id = public.current_org()
    and exists (select 1 from public.org_sms_settings s
                where s.organization_id = public.current_org() and s.enabled)
  );

-- ============================================================================
-- Workflow RPCs (SECURITY DEFINER so state changes are role-gated, not
-- editable directly through the table API).
-- ============================================================================

-- A manager requests SMS activation for their own org.
create or replace function public.request_org_sms()
returns void language plpgsql security definer set search_path = public as $$
declare r text; org uuid;
begin
  r := public.current_role();
  org := public.current_org();
  if r <> 'manager' or org is null then
    raise exception 'Only a manager can request SMS alerts for their organization';
  end if;
  insert into public.org_sms_settings (organization_id, status, requested_by, requested_at, updated_at)
    values (org, 'pending', auth.uid(), now(), now())
  on conflict (organization_id) do update
    set status       = case when org_sms_settings.enabled then org_sms_settings.status else 'pending' end,
        requested_by = auth.uid(),
        requested_at = now(),
        updated_at   = now();
end; $$;
grant execute on function public.request_org_sms() to authenticated;

-- A Super Admin approves or denies a request.
create or replace function public.review_org_sms(target_org uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can review SMS requests';
  end if;
  insert into public.org_sms_settings (organization_id, status, enabled, reviewed_by, reviewed_at, updated_at)
    values (target_org, case when approve then 'approved' else 'denied' end, approve, auth.uid(), now(), now())
  on conflict (organization_id) do update
    set status      = case when approve then 'approved' else 'denied' end,
        enabled     = approve,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at  = now();
end; $$;
grant execute on function public.review_org_sms(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
