-- ============================================================================
-- Phase 2.1 — Per-device alarm routing (email + SMS) and admin SMS management
-- Run in the Supabase SQL editor.
-- ============================================================================

-- SMS: a recipient covers all org devices by default; or a specific subset.
alter table public.sms_recipients
  add column if not exists all_devices boolean not null default true;

create table if not exists public.sms_recipient_devices (
  recipient_id uuid not null references public.sms_recipients(id) on delete cascade,
  device_id    uuid not null references public.devices(id) on delete cascade,
  primary key (recipient_id, device_id)
);
create index if not exists srd_device_idx on public.sms_recipient_devices(device_id);

-- Email: a user gets all org devices by default; or a specific subset.
alter table public.profiles
  add column if not exists alarm_email_all_devices boolean not null default true;

create table if not exists public.email_alarm_devices (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  primary key (user_id, device_id)
);
create index if not exists ead_device_idx on public.email_alarm_devices(device_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.sms_recipient_devices enable row level security;
alter table public.email_alarm_devices   enable row level security;

-- sms_recipient_devices: admins all; members read own org; managers CUD own
-- org while SMS enabled (scoped through the parent recipient's org).
create policy srd_admin_all on public.sms_recipient_devices
  for all using (public.is_admin()) with check (public.is_admin());
create policy srd_member_select on public.sms_recipient_devices
  for select using (exists (
    select 1 from public.sms_recipients r
    where r.id = sms_recipient_devices.recipient_id and r.organization_id = public.current_org()));
create policy srd_manager_cud on public.sms_recipient_devices
  for all using (exists (
    select 1 from public.sms_recipients r
    join public.org_sms_settings s on s.organization_id = r.organization_id
    where r.id = sms_recipient_devices.recipient_id
      and r.organization_id = public.current_org()
      and public.current_role() = 'manager' and s.enabled))
  with check (exists (
    select 1 from public.sms_recipients r
    join public.org_sms_settings s on s.organization_id = r.organization_id
    where r.id = sms_recipient_devices.recipient_id
      and r.organization_id = public.current_org()
      and public.current_role() = 'manager' and s.enabled));

-- email_alarm_devices: a user manages only their own rows; admins may read all.
create policy ead_self_all on public.email_alarm_devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ead_admin_select on public.email_alarm_devices
  for select using (public.is_admin());

-- RPC: a user sets their own "all devices" email flag (column-safe self update).
create or replace function public.set_my_alarm_email_all_devices(all_devices boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set alarm_email_all_devices = all_devices where id = auth.uid();
$$;
grant execute on function public.set_my_alarm_email_all_devices(boolean) to authenticated;

notify pgrst, 'reload schema';
