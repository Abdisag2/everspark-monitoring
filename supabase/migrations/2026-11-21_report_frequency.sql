-- ============================================================================
-- Scheduled reports — per-subscription cadence
-- Run in the Supabase SQL editor.
--
-- Adds a `frequency` to report_subscriptions so a user can get a device's report
-- daily / weekly / monthly / quarterly / semiannual / yearly instead of only
-- monthly. Existing rows default to 'monthly', preserving current behaviour.
-- The scheduled job (/api/monthly-reports) now runs daily and sends what is due.
-- ============================================================================

alter table public.report_subscriptions
  add column if not exists frequency text not null default 'monthly'
  check (frequency in ('daily','weekly','monthly','quarterly','semiannual','yearly'));

notify pgrst, 'reload schema';
