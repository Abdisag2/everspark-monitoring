-- ============================================================================
-- Device SIM card number — so an offline (out-of-balance) device is easy to
-- recharge. Nullable in the DB (existing rows keep working); the app form
-- makes it mandatory for new and edited devices.
-- Run in the Supabase SQL editor.
-- ============================================================================
alter table public.devices add column if not exists sim_number text;

notify pgrst, 'reload schema';
