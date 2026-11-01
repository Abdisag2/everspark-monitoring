-- ============================================================================
-- Phase 1 — Email alarm notifications
-- Run in the Supabase SQL editor.
-- ============================================================================

-- 1. Per-user preference: email me when my org's devices raise an alarm.
--    Default OFF — users opt in from the app.
alter table public.profiles
  add column if not exists alarm_email_enabled boolean not null default false;

-- 2. Dedupe stamp so an alarm is emailed at most once (webhook retries are safe).
alter table public.alarms
  add column if not exists notified_at timestamptz;

-- 3. Let a signed-in user flip ONLY their own preference.
--    SECURITY DEFINER so we don't need a broad self-update RLS policy on
--    profiles (which would also let users change their own role/org).
create or replace function public.set_my_alarm_email(enabled boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set alarm_email_enabled = enabled where id = auth.uid();
$$;
grant execute on function public.set_my_alarm_email(boolean) to authenticated;

notify pgrst, 'reload schema';
