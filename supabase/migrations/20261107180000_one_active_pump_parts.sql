-- One active pump-parts row per saved pump (family_id, pump_id).
-- A new log clears the previous active row as 'replaced' and lets the
-- insert create a fresh wash-by and its own reminder. Milk is untouched.
--
-- prepare_reminder copies old.baby_id on UPDATE, so this backfill never
-- writes baby_id. Clearing the older chiller row fires
-- chiller_items_sync_reminder, which only sets reminders.enabled = false.
-- That disable survives the prepare trigger.

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
      and cleared_reason in ('washed', 'discarded', 'replaced')
    )
  );

comment on column public.chiller_items.cleared_reason is
  'used or discarded for milk. washed, discarded, or replaced for pump parts.';

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
    and cleared_at is null;

  return new;
end;
$$;

comment on function private.replace_active_pump_parts() is
  'Before a pump-parts insert, clear the active row for that saved pump so the new row is the only one in the chiller.';

revoke all on function private.replace_active_pump_parts() from public, anon, authenticated;

create trigger chiller_items_replace_pump_parts
before insert on public.chiller_items
for each row
execute function private.replace_active_pump_parts();

-- Keep the newest active row for each pump. Clear older duplicates; do not delete them.
with ranked as (
  select
    id,
    row_number() over (
      partition by family_id, pump_id
      order by stored_at desc, created_at desc, id desc
    ) as rn
  from public.chiller_items
  where type = 'pump_parts'
    and cleared_at is null
    and pump_id is not null
)
update public.chiller_items as item
set
  cleared_at = now(),
  cleared_reason = 'replaced',
  cleared_by = coalesce(
    item.created_by,
    (
      select member.user_id
      from public.family_members as member
      where member.family_id = item.family_id
      order by (member.role = 'owner') desc
      limit 1
    )
  )
from ranked
where item.id = ranked.id
  and ranked.rn > 1;

create unique index chiller_items_one_active_pump_parts
  on public.chiller_items (family_id, pump_id)
  where type = 'pump_parts'
    and cleared_at is null
    and pump_id is not null;
