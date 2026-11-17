-- ============================================================================
-- Remote calibration — phase 2: admin-only chlorine / dosing writes
-- Run in the Supabase SQL editor (replaces queue_device_command in place).
--
-- Adds `dosing set <name> <value>` to the allowlist, restricted to ADMINS (the
-- dosing board controls how much chlorine goes into treated drinking water, so
-- it is a tighter gate than the main-board timers a manager may change). The
-- dosing board validates each value's range itself and rejects out-of-range
-- sets. Interactive routines (pumpcal/flowcal/dose/flowsim/defaults) stay out.
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

  -- Resolve the device's org and authorize the caller (admin, or a manager of
  -- the device's org). Command-specific gates below tighten this further.
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

  -- Classify + validate against the allowlist.
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
      raise exception 'parameter "%" is not remotely settable', tokens[2];
    end if;
    new_kind := 'write';                                  -- main-board set (admin or manager)
  elsif verb = 'dosing' and lower(tokens[2]) = 'set' and array_length(tokens,1) = 4 then
    if not public.is_admin() then
      raise exception 'only administrators can calibrate the chlorine / dosing unit';
    end if;
    new_kind := 'write';                                  -- dosing set <name> <value> (admin only)
  else
    raise exception 'command "%" is not allowed', line;
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
