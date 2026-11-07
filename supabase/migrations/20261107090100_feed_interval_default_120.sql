-- Feed reminders use babies.suggested_interval_minutes, or 120 minutes when that is null.
-- Diaper and pump stay on 3 hours. Push reads reminders.next_due_at; it does not pick an interval itself.

comment on column public.babies.suggested_interval_minutes is
  'Minutes between feeds. Null means 120 (2 hours).';

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

    minutes := coalesce(baby_row.suggested_interval_minutes, 120);
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
  'A diaper, feed, or pump log reschedules the shared reminder. Feeds use the baby interval, or 120 minutes when it is null. Diaper and pump use 3 hours.';

create or replace function private.reschedule_feed_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes integer;
  last_at timestamptz;
begin
  if new.suggested_interval_minutes is not distinct from old.suggested_interval_minutes then
    return new;
  end if;

  minutes := coalesce(new.suggested_interval_minutes, 120);

  select log.occurred_at
  into last_at
  from public.logs as log
  where log.baby_id = new.id
    and log.kind = 'feed'
  order by log.occurred_at desc
  limit 1;

  if last_at is null then
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
    new.id,
    new.family_id,
    'feed',
    last_at + make_interval(mins => minutes),
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

comment on function private.reschedule_feed_reminder() is
  'Editing the feed interval moves the shared feed reminder from the latest feed.';

create trigger babies_reschedule_feed
after update of suggested_interval_minutes on public.babies
for each row
execute function private.reschedule_feed_reminder();

revoke all on function private.reschedule_feed_reminder() from public, anon, authenticated;

update public.reminders as reminder
set
  next_due_at = last_feed.occurred_at + make_interval(mins => 120),
  notified_at = case
    when last_feed.occurred_at + make_interval(mins => 120) <= now()
      then coalesce(reminder.notified_at, now())
    else null
  end,
  updated_at = now()
from public.babies as baby
join lateral (
  select log.occurred_at
  from public.logs as log
  where log.baby_id = baby.id
    and log.kind = 'feed'
  order by log.occurred_at desc
  limit 1
) as last_feed on true
where reminder.baby_id = baby.id
  and reminder.reminder_type = 'feed'
  and reminder.chiller_item_id is null
  and baby.suggested_interval_minutes is null;
