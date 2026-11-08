-- Family pump schedule. Hours apply to every selected day in the stored timezone.
-- An empty hour list means no pump reminder. Logging a pump does not move it.
-- Not applied in this change; run it in the Supabase SQL editor or CLI when ready.

alter table public.families
  add column pump_hours smallint[] not null default '{}',
  add column pump_days smallint[] not null default '{1,2,3,4,5,6,7}',
  add column pump_schedule_timezone text not null default 'UTC';

alter table public.families
  add constraint families_pump_hours_check check (
    pump_hours <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[]
  ),
  add constraint families_pump_days_check check (
    pump_days <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  add constraint families_pump_timezone_check check (char_length(btrim(pump_schedule_timezone)) > 0);

comment on column public.families.pump_hours is
  'Local hours 0-23 when a pump reminder is due. Empty means no pump reminder.';
comment on column public.families.pump_days is
  'ISO weekdays 1-7 (Monday-Sunday) the pump hours repeat on.';
comment on column public.families.pump_schedule_timezone is
  'IANA timezone used to place pump_hours. Saved from the member who last edited the schedule.';

create or replace function private.next_pump_slot(
  hours smallint[],
  days smallint[],
  tz text,
  after timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  zone text := coalesce(nullif(btrim(tz), ''), 'UTC');
  local_day date;
  offset_days integer;
  hour integer;
  candidate timestamptz;
  slot timestamptz;
begin
  if hours is null or cardinality(hours) = 0 or days is null or cardinality(days) = 0 then
    return null;
  end if;

  begin
    perform timezone(zone, now());
  exception
    when others then
      zone := 'UTC';
  end;

  local_day := (timezone(zone, after))::date;

  for offset_days in 0..8 loop
    if extract(isodow from (local_day + offset_days))::integer = any (days) then
      foreach hour in array hours loop
        if hour < 0 or hour > 23 then
          continue;
        end if;
        candidate := make_timestamptz(
          extract(year from (local_day + offset_days))::integer,
          extract(month from (local_day + offset_days))::integer,
          extract(day from (local_day + offset_days))::integer,
          hour,
          0,
          0,
          zone
        );
        if candidate > after and (slot is null or candidate < slot) then
          slot := candidate;
        end if;
      end loop;
    end if;
  end loop;

  return slot;
end;
$$;

comment on function private.next_pump_slot(smallint[], smallint[], text, timestamptz) is
  'Next selected hour on a selected weekday, in the schedule timezone, strictly after the given time.';

create or replace function private.recompute_care_reminder(
  target_baby uuid,
  target_family uuid,
  target_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes integer;
  last_at timestamptz;
  due_at timestamptz;
  baby_row public.babies%rowtype;
begin
  -- Pump reminders follow the family schedule, not the last pump log.
  if target_kind = 'pump' or target_kind not in ('diaper', 'feed') then
    return;
  end if;

  select *
  into baby_row
  from public.babies as baby
  where baby.id = target_baby;

  if target_kind = 'diaper' then
    minutes := coalesce(baby_row.diaper_interval_minutes, 180);
  else
    minutes := coalesce(baby_row.suggested_interval_minutes, 120);
  end if;

  select log.occurred_at
  into last_at
  from public.logs as log
  where log.baby_id = target_baby
    and log.kind = target_kind::public.log_kind
    and log.deleted_at is null
  order by log.occurred_at desc
  limit 1;

  if last_at is null then
    update public.reminders
    set
      enabled = false,
      updated_at = now()
    where baby_id = target_baby
      and reminder_type = target_kind::public.reminder_type
      and chiller_item_id is null;
    return;
  end if;

  due_at := last_at + make_interval(mins => minutes);

  insert into public.reminders (
    baby_id,
    family_id,
    reminder_type,
    next_due_at,
    audience,
    notified_at,
    enabled
  )
  values (
    target_baby,
    target_family,
    target_kind::public.reminder_type,
    due_at,
    'family',
    null,
    true
  )
  on conflict (baby_id, reminder_type) where chiller_item_id is null
  do update
    set
      next_due_at = excluded.next_due_at,
      notified_at = case
        when public.reminders.next_due_at is distinct from excluded.next_due_at then null
        else public.reminders.notified_at
      end,
      enabled = true,
      updated_at = now();
end;
$$;

comment on function private.recompute_care_reminder(uuid, uuid, text) is
  'Sets the diaper or feed reminder from the latest log that is not deleted. Pump is ignored.';

delete from public.reminders
where reminder_type = 'pump'
  and baby_id is not null;

alter table public.reminders
  drop constraint reminders_shape;

alter table public.reminders
  add constraint reminders_shape check (
    (
      reminder_type = 'pump_parts'
      and chiller_item_id is not null
      and audience = 'caregivers'
      and baby_id is null
    )
    or (
      reminder_type = 'pump'
      and chiller_item_id is null
      and baby_id is null
      and audience = 'family'
    )
    or (
      reminder_type in ('diaper', 'feed')
      and chiller_item_id is null
      and baby_id is not null
    )
  );

comment on column public.reminders.baby_id is
  'The baby a diaper or feed reminder belongs to. Null for the family pump schedule and for pump-parts wash reminders.';

create unique index reminders_family_pump_key
  on public.reminders (family_id)
  where reminder_type = 'pump'
    and baby_id is null
    and chiller_item_id is null;

create or replace function private.sync_pump_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_at timestamptz;
begin
  if new.pump_hours is not distinct from old.pump_hours
    and new.pump_days is not distinct from old.pump_days
    and new.pump_schedule_timezone is not distinct from old.pump_schedule_timezone then
    return new;
  end if;

  due_at := private.next_pump_slot(new.pump_hours, new.pump_days, new.pump_schedule_timezone, clock_timestamp());

  if due_at is null then
    update public.reminders
    set
      enabled = false,
      updated_at = now()
    where family_id = new.id
      and reminder_type = 'pump'
      and baby_id is null
      and chiller_item_id is null;
    return new;
  end if;

  insert into public.reminders (
    baby_id,
    family_id,
    reminder_type,
    next_due_at,
    audience,
    notified_at,
    enabled
  )
  values (
    null,
    new.id,
    'pump',
    due_at,
    'family',
    null,
    true
  )
  on conflict (family_id) where reminder_type = 'pump' and baby_id is null and chiller_item_id is null
  do update
    set
      next_due_at = excluded.next_due_at,
      notified_at = case
        when public.reminders.next_due_at is distinct from excluded.next_due_at then null
        else public.reminders.notified_at
      end,
      enabled = true,
      updated_at = now();

  return new;
end;
$$;

create trigger families_sync_pump_schedule
after update of pump_hours, pump_days, pump_schedule_timezone on public.families
for each row
execute function private.sync_pump_schedule();

create or replace function public.advance_pump_reminders(reminder_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_id uuid;
  row public.reminders%rowtype;
  fam public.families%rowtype;
  due_at timestamptz;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  if reminder_ids is null then
    return;
  end if;

  foreach reminder_id in array reminder_ids loop
    select *
    into row
    from public.reminders
    where id = reminder_id
      and reminder_type = 'pump'
      and baby_id is null;

    if not found then
      continue;
    end if;

    select *
    into fam
    from public.families
    where id = row.family_id;

    due_at := private.next_pump_slot(fam.pump_hours, fam.pump_days, fam.pump_schedule_timezone, clock_timestamp());

    if due_at is null then
      update public.reminders
      set
        enabled = false,
        notified_at = null,
        updated_at = now()
      where id = reminder_id;
    else
      update public.reminders
      set
        next_due_at = due_at,
        notified_at = null,
        enabled = true,
        updated_at = now()
      where id = reminder_id;
    end if;
  end loop;
end;
$$;

comment on function public.advance_pump_reminders(uuid[]) is
  'After a pump push is sent, move that family reminder to the following scheduled slot and clear notified_at.';

revoke all on function private.next_pump_slot(smallint[], smallint[], text, timestamptz) from public, anon, authenticated;
revoke all on function private.sync_pump_schedule() from public, anon, authenticated;
revoke all on function public.advance_pump_reminders(uuid[]) from public, anon, authenticated;
grant execute on function public.advance_pump_reminders(uuid[]) to service_role;
