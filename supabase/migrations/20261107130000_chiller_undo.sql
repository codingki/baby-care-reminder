-- Undo can clear the status. A pump-parts reminder comes back only if the item has not expired.
-- Discarded is allowed on pump parts so "clear all expired" can use one reason.

alter table public.chiller_items
  drop constraint chiller_items_cleared_reason;

alter table public.chiller_items
  add constraint chiller_items_cleared_reason check (
    cleared_reason is null
    or (
      type = 'milk'
      and cleared_reason in ('used', 'discarded')
    )
    or (
      type = 'pump_parts'
      and cleared_reason in ('washed', 'discarded')
    )
  );

comment on column public.chiller_items.cleared_reason is
  'used or discarded for milk. washed or discarded for pump parts.';

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

  if new.cleared_at is not null or new.type <> 'pump_parts' or new.expires_at <= now() then
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
    new.baby_id,
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
      next_due_at = excluded.next_due_at,
      notified_at = null,
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

comment on function private.sync_pump_parts_reminder() is
  'Pump parts get a wash reminder until cleared or expired. Restoring a cleared item turns the reminder back on only while it has not expired.';
