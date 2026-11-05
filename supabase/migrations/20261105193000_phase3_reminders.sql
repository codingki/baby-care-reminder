-- Phase 3. Not applied to the hosted database.
-- One reminder per baby and type. A log moves next_due_at forward for the whole family.
-- notified_at stops the cron from sending the same due time twice.

alter table public.reminders
  add column notified_at timestamptz;

alter table public.chiller_items
  add column notified_at timestamptz;

comment on column public.reminders.notified_at is
  'Set when a due reminder was handed to push. Cleared when next_due_at moves.';
comment on column public.chiller_items.notified_at is
  'Set when a milk-expiry alert was handed to push.';

create or replace function private.touch_schedule_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes integer;
  baby_row public.babies%rowtype;
begin
  if new.kind = 'diaper' then
    minutes := 180;
  elsif new.kind = 'pump' then
    minutes := 180;
  elsif new.kind = 'feed' then
    select *
    into baby_row
    from public.babies as baby
    where baby.id = new.baby_id;

    minutes := baby_row.suggested_interval_minutes;

    if minutes is null then
      select guideline.interval_minutes
      into minutes
      from public.feeding_guidelines as guideline
      where (current_date - baby_row.birth_date)
        between guideline.age_min_days and coalesce(guideline.age_max_days, 100000)
        and (
          baby_row.weight_grams is null
          or baby_row.weight_grams >= guideline.weight_min_grams
        )
        and (
          baby_row.weight_grams is null
          or guideline.weight_max_grams is null
          or baby_row.weight_grams <= guideline.weight_max_grams
        )
      order by guideline.weight_min_grams desc
      limit 1;
    end if;

    minutes := coalesce(minutes, 180);
  else
    return new;
  end if;

  insert into public.reminders (
    baby_id,
    family_id,
    reminder_type,
    next_due_at,
    audience,
    notified_at
  )
  values (
    new.baby_id,
    new.family_id,
    new.kind::text::public.reminder_type,
    new.occurred_at + make_interval(mins => minutes),
    'family',
    null
  )
  on conflict (baby_id, reminder_type) where chiller_item_id is null
  do update
    set
      next_due_at = excluded.next_due_at,
      notified_at = null,
      enabled = true,
      updated_at = now();

  return new;
end;
$$;

comment on function private.touch_schedule_reminder() is
  'A diaper, feed, or pump log reschedules the shared reminder. Feeds use the baby override, then the guideline, then 3 hours. Diaper and pump use 3 hours.';

create trigger logs_touch_reminder
after insert on public.logs
for each row
execute function private.touch_schedule_reminder();

create or replace function private.sync_pump_parts_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_at timestamptz;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.type <> 'pump_parts' then
    delete from public.reminders
    where chiller_item_id = new.id;
    return new;
  end if;

  due_at := greatest(new.stored_at, new.expires_at - interval '30 minutes');

  insert into public.reminders (
    baby_id,
    family_id,
    reminder_type,
    next_due_at,
    audience,
    chiller_item_id,
    notified_at
  )
  values (
    new.baby_id,
    new.family_id,
    'pump_parts',
    due_at,
    'caregivers',
    new.id,
    null
  )
  on conflict (chiller_item_id) where chiller_item_id is not null
  do update
    set
      next_due_at = excluded.next_due_at,
      notified_at = null,
      updated_at = now();

  if new.pump_id is not null then
    update public.family_pumps
    set last_used_at = new.stored_at
    where id = new.pump_id
      and (last_used_at is null or last_used_at < new.stored_at);
  end if;

  return new;
end;
$$;

revoke all on function private.touch_schedule_reminder() from public, anon, authenticated;
revoke all on function private.sync_pump_parts_reminder() from public, anon, authenticated;
