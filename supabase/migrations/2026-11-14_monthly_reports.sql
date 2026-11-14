-- ============================================================================
-- Monthly reports — per-user, per-device subscription + send-dedupe log
-- Run in the Supabase SQL editor.
-- ============================================================================

-- A user opts in to a monthly CSV+PDF report for specific devices.
-- Presence of a row = subscribed. No row = not subscribed (default OFF).
create table if not exists public.report_subscriptions (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
create index if not exists rsub_device_idx on public.report_subscriptions(device_id);

-- Idempotency guard for the scheduled job: one row per (user, device, month)
-- that was emailed, so a cron retry can't double-send. Written by the service role.
create table if not exists public.monthly_report_log (
  user_id      uuid not null,
  device_id    uuid not null,
  period_start date not null,         -- first day of the reported month (UTC)
  sent_at      timestamptz not null default now(),
  primary key (user_id, device_id, period_start)
);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.report_subscriptions enable row level security;
alter table public.monthly_report_log   enable row level security;

-- report_subscriptions: a user manages only their own rows; admins may read all.
-- (The scheduled job uses the service role, which bypasses RLS.)
create policy rsub_self_all on public.report_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rsub_admin_select on public.report_subscriptions
  for select using (public.is_admin());

-- monthly_report_log: no policies → only the service role can read/write it.

notify pgrst, 'reload schema';
