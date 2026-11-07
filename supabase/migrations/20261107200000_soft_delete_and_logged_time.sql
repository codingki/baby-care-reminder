-- Soft-delete logs and chiller rows. Reminders follow the latest log that is
-- still visible, using that log's occurred_at (not the database clock).
-- Milk expiry and pump-parts wash-by are counted from stored_at.

alter table public.logs
  add column deleted_at timestamptz;

alter table public.weight_logs
  add column deleted_at timestamptz;

alter table public.chiller_items
  add column deleted_at timestamptz;

comment on column public.logs.deleted_at is
  'Set when a caregiver deletes a log. Null while the log still counts.';
comment on column public.weight_logs.deleted_at is
  'Set when a caregiver deletes a weight check. Null while it still counts.';
comment on column public.chiller_items.deleted_at is
  'Set when a caregiver deletes a chiller row. Hidden from both the chiller and Cleared history.';

create index logs_active_baby_kind_idx
  on public.logs (baby_id, kind, occurred_at desc)
  where deleted_at is null;

drop index if exists public.chiller_items_one_active_pump_parts;

create unique index chiller_items_one_active_pump_parts
  on public.chiller_items (family_id, pump_id)
  where type = 'pump_parts'
    and cleared_at is null
    and deleted_at is null
    and pump_id is not null;

create or replace function private.replace_active_pump_parts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  if new.type <> 'pump_parts' or new.pump_id is null then
    return new;
  end if;

  perform 1
  from public.family_pumps
  where id = new.pump_id
  for update;

  actor := coalesce(
    new.created_by,
    (
      select member.user_id
      from public.family_members as member
      where member.family_id = new.family_id
      order by (member.role = 'owner') desc
      limit 1
    )
  );

  update public.chiller_items
  set
    cleared_at = now(),
    cleared_reason = 'replaced',
    cleared_by = actor
  where family_id = new.family_id
    and pump_id = new.pump_id
    and type = 'pump_parts'
    and cleared_at is null
    and deleted_at is null;

  return new;
end;
$$;

create or replace function private.apply_chiller_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wash_hours integer;
begin
  if new.stored_at is null then
    return new;
  end if;

  if new.type = 'milk' then
    new.expires_at := new.stored_at + case new.location
      when 'room' then interval '4 hours'
      when 'fridge' then interval '4 days'
      when 'freezer' then interval '182 days'
      when 'cooler' then interval '24 hours'
      when 'thawed' then interval '24 hours'
      when 'leftover' then interval '2 hours'
      else interval '4 days'
    end;
  elsif new.type = 'pump_parts' then
    select family.pump_parts_wash_by_hours
    into wash_hours
    from public.families as family
    where family.id = new.family_id;
    new.expires_at := new.stored_at + make_interval(hours => coalesce(wash_hours, 24));
  end if;

  return new;
end;
$$;

comment on function private.apply_chiller_expiry() is
  'Milk expiry and pump-parts wash-by are counted from stored_at, the time the caregiver picked.';

create trigger chiller_items_apply_expiry
before insert or update of stored_at, location, type on public.chiller_items
for each row
execute function private.apply_chiller_expiry();

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

  if new.deleted_at is not null or new.cleared_at is not null or new.type <> 'pump_parts' or new.expires_at <= now() then
    update public.reminders
    set
      enabled = false,
      updated_at = now()
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
    notified_at,
    enabled
  )
  values (
    null,
    new.family_id,
    'pump_parts',
    due_at,
    'caregivers',
    new.id,
    null,
    true
  )
  on conflict (chiller_item_id) where chiller_item_id is not null
  do update
    set
      baby_id = null,
      next_due_at = excluded.next_due_at,
      notified_at = case
        when public.reminders.next_due_at is distinct from excluded.next_due_at then null
        else public.reminders.notified_at
      end,
      enabled = true,
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
  if target_kind not in ('diaper', 'feed', 'pump') then
    return;
  end if;

  select *
  into baby_row
  from public.babies as baby
  where baby.id = target_baby;

  if target_kind = 'diaper' then
    minutes := coalesce(baby_row.diaper_interval_minutes, 180);
  elsif target_kind = 'feed' then
    minutes := coalesce(baby_row.suggested_interval_minutes, 120);
  else
    minutes := 180;
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
  'Sets the shared reminder from the latest log that is not deleted. notified_at resets only when the due time changes.';

create or replace function private.reschedule_after_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.logs%rowtype;
begin
  row := coalesce(new, old);
  if row.kind in ('diaper', 'feed', 'pump') then
    perform private.recompute_care_reminder(row.baby_id, row.family_id, row.kind::text);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger logs_reschedule_after_change
after update or delete on public.logs
for each row
execute function private.reschedule_after_log_change();

create or replace function private.touch_schedule_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  perform private.recompute_care_reminder(new.baby_id, new.family_id, new.kind::text);
  return new;
end;
$$;

create or replace function private.reschedule_feed_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.suggested_interval_minutes is not distinct from old.suggested_interval_minutes then
    return new;
  end if;
  perform private.recompute_care_reminder(new.id, new.family_id, 'feed');
  return new;
end;
$$;

create or replace function private.reschedule_diaper_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.diaper_interval_minutes is not distinct from old.diaper_interval_minutes then
    return new;
  end if;
  perform private.recompute_care_reminder(new.id, new.family_id, 'diaper');
  return new;
end;
$$;

create or replace function private.sync_baby_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest integer;
  target uuid;
begin
  target := coalesce(new.baby_id, old.baby_id);

  select log.weight_grams
  into latest
  from public.weight_logs as log
  where log.baby_id = target
    and log.deleted_at is null
  order by log.weighed_on desc, log.created_at desc
  limit 1;

  update public.babies
  set
    weight_grams = latest,
    updated_at = now()
  where id = target;

  return coalesce(new, old);
end;
$$;

revoke all on function private.apply_chiller_expiry() from public, anon, authenticated;
revoke all on function private.recompute_care_reminder(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.reschedule_after_log_change() from public, anon, authenticated;
