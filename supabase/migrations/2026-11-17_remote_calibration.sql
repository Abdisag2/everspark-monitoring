-- ============================================================================
-- Remote calibration — device command queue (v1: read config + main-board params)
-- Run in the Supabase SQL editor.
--
-- Flow:  Calibration UI (Vercel) --RPC--> device_commands (queued)
--        EC2 bridge claims queued rows, publishes over MQTT to the site gateway,
--        the gateway writes the command line to Clara over RS485, reads the text
--        answer, publishes it back; EC2 writes it into the row (acked / error).
--
-- Clara firmware contract (branch claude/clara-rs485-remote-cal): a command is one
-- plain-text console line ending in '\n'; the answer is a text line that never
-- starts with ';' (telemetry frames do). See docs/REMOTE_CALIBRATION.md.
-- ============================================================================

create table if not exists public.device_commands (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references public.devices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  command         text not null,                 -- exact line sent to Clara, e.g. 'set report_interval 60'
  kind            text not null check (kind in ('read','write')),
  status          text not null default 'queued'
                    check (status in ('queued','sent','acked','error','timeout','canceled')),
  response        text,                           -- Clara's text answer, or an EC2 transport note
  issued_by       uuid references public.profiles(id) on delete set null,
  issued_role     text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,                    -- EC2 published it to MQTT
  acked_at        timestamptz                     -- EC2 recorded the answer / timeout
);

create index if not exists device_commands_device_idx
  on public.device_commands(device_id, created_at desc);
-- Fast claim query for the EC2 bridge.
create index if not exists device_commands_queued_idx
  on public.device_commands(status) where status = 'queued';

-- ============================================================================
-- RLS — members read their own org's command history; ALL writes go through the
-- RPC below or the service role (EC2). No direct INSERT/UPDATE/DELETE policies.
-- ============================================================================
alter table public.device_commands enable row level security;

create policy devcmd_admin_all on public.device_commands
  for all using (public.is_admin()) with check (public.is_admin());

create policy devcmd_member_select on public.device_commands
  for select using (organization_id = public.current_org());

-- ============================================================================
-- queue_device_command() — the ONLY way the app enqueues a command.
--
-- SECURITY DEFINER so the authz + the v1 allowlist are enforced server-side:
--   * caller must be an admin, or a manager of the device's organization;
--   * reads  (get / status / i2c / report / dosing get) are always allowed;
--   * writes are ONLY `set <name> <value>` for a SAFE main-board parameter.
--     report_baud and remote_cal are deliberately NOT settable remotely — either
--     one, set wrong, would cut the unit off from the remote link (self-lockout).
--     Dosing / chlorine calibration (target_frc, pumpcal, dose, defaults, ...) is
--     out of scope for v1 and rejected here.
-- Returns the new command id.
-- ============================================================================
create or replace function public.queue_device_command(target_device uuid, cmd text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dev_org  uuid;
  line     text := btrim(cmd);
  lower_ln text;
  tokens   text[];
  verb     text;
  pname    text;
  new_kind text;
  new_id   uuid;
  -- Main-board params that are safe to set over the remote link (excludes
  -- report_baud and remote_cal: both can lock out the remote link).
  safe_set text[] := array[
    'production_min','settling_min','transfer_min','polarity_cycles',
    'report_interval','level_debounce','voltage_ref','voltage_divider',
    'resume_batch','checkpoint_min','water_ph','active_cl',
    'usb_window_min','usb_idle_min'
  ];
begin
  if line = '' then
    raise exception 'empty command';
  end if;

  -- Resolve the device's org and authorize the caller.
  select organization_id into dev_org from public.devices where id = target_device;
  if dev_org is null then
    raise exception 'device not found';
  end if;
  if not (public.is_admin()
          or (public.current_role() = 'manager' and dev_org = public.current_org())) then
    raise exception 'not authorized to calibrate this device';
  end if;

  lower_ln := lower(line);
  tokens   := regexp_split_to_array(line, '\s+');
  verb     := lower(tokens[1]);

  -- Classify + validate against the v1 allowlist.
  if lower_ln = 'get' or lower_ln = 'status' or lower_ln = 'i2c'
     or lower_ln = 'report' or lower_ln = 'dosing get' then
    new_kind := 'read';
  elsif verb = 'get' and array_length(tokens,1) = 2 then
    new_kind := 'read';                                   -- get <name|#>
  elsif verb = 'dosing' and lower(tokens[2]) = 'get' and array_length(tokens,1) = 3 then
    new_kind := 'read';                                   -- dosing get <name|#>
  elsif verb = 'set' and array_length(tokens,1) = 3 then
    pname := lower(tokens[2]);
    if not (pname = any(safe_set)) then
      raise exception 'parameter "%" is not remotely settable in v1', tokens[2];
    end if;
    new_kind := 'write';
  else
    raise exception 'command "%" is not allowed in v1 (read config + main-board set only)', line;
  end if;

  insert into public.device_commands
    (device_id, organization_id, command, kind, issued_by, issued_role)
  values
    (target_device, dev_org, line, new_kind, auth.uid(), public.current_role())
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.queue_device_command(uuid, text) from public, anon;
grant execute on function public.queue_device_command(uuid, text) to authenticated;

notify pgrst, 'reload schema';
