-- Diaper reminders use babies.diaper_interval_minutes, or 180 minutes when that is null.

alter table public.babies
  add column diaper_interval_minutes integer;

alter table public.babies
  add constraint babies_diaper_interval_positive check (
    diaper_interval_minutes is null or diaper_interval_minutes > 0
  );

comment on column public.babies.diaper_interval_minutes is
  'Minutes between diapers. Null means 180 (3 hours).';

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
  if new.kind = 'diaper' or new.kind = 'feed' then
    select *
    into baby_row
    from public.babies as baby
    where baby.id = new.baby_id;
  end if;

  if new.kind = 'diaper' then
    minutes := coalesce(baby_row.diaper_interval_minutes, 180);
  elsif new.kind = 'pump' then
    minutes := 180;
  elsif new.kind = 'feed' then
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
  'A diaper, feed, or pump log reschedules the shared reminder. Diapers use the baby interval or 180 minutes. Feeds use the baby interval or 120 minutes. Pumps use 3 hours. A direct breastfeed is a feed.';

create or replace function private.reschedule_diaper_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes integer;
  last_at timestamptz;
begin
  if new.diaper_interval_minutes is not distinct from old.diaper_interval_minutes then
    return new;
  end if;

  minutes := coalesce(new.diaper_interval_minutes, 180);

  select log.occurred_at
  into last_at
  from public.logs as log
  where log.baby_id = new.id
    and log.kind = 'diaper'
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
    'diaper',
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

comment on function private.reschedule_diaper_reminder() is
  'Editing the diaper interval moves the shared diaper reminder from the latest diaper.';

create trigger babies_reschedule_diaper
after update of diaper_interval_minutes on public.babies
for each row
execute function private.reschedule_diaper_reminder();

revoke all on function private.reschedule_diaper_reminder() from public, anon, authenticated;
