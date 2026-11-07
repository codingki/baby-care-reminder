-- Chiller storage is family-wide. Pump parts never belong to a baby.
-- Milk may name a baby, and that field starts empty.
--
-- Order matters on a database that already has pump-parts rows:
-- replace the triggers first, or the backfill UPDATE still calls the old
-- prepare_chiller_item and raises 'invalid baby'. prepare_reminder copies
-- old.baby_id on UPDATE, so the reminders backfill has to run with that
-- trigger disabled. reminders_shape is added only after both backfills.

create or replace function private.prepare_chiller_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  baby_family uuid;
  pump_family uuid;
begin
  if new.type = 'pump_parts' then
    new.baby_id := null;
  end if;

  if new.baby_id is not null then
    baby_family := private.baby_family_id(new.baby_id);
    if baby_family is null then
      raise exception 'invalid baby';
    end if;
    new.family_id := baby_family;
  elsif new.family_id is null then
    raise exception 'invalid family';
  end if;

  if new.pump_id is not null then
    select pump.family_id
    into pump_family
    from public.family_pumps as pump
    where pump.id = new.pump_id;

    if pump_family is distinct from new.family_id then
      raise exception 'invalid pump';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

create or replace function private.prepare_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  baby_family uuid;
begin
  if tg_op = 'UPDATE' then
    new.baby_id := old.baby_id;
    new.reminder_type := old.reminder_type;
    new.chiller_item_id := old.chiller_item_id;
    new.audience := old.audience;
  end if;

  if new.baby_id is null then
    if new.family_id is null then
      raise exception 'invalid family';
    end if;
  else
    baby_family := private.baby_family_id(new.baby_id);
    if baby_family is null then
      raise exception 'invalid baby';
    end if;
    new.family_id := baby_family;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

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
  'Pump parts get a family wash reminder with no baby. It stays off once the item is cleared or expired.';

alter table public.chiller_items
  alter column baby_id drop not null;

alter table public.chiller_items
  drop constraint chiller_items_baby_id_fkey;

alter table public.chiller_items
  add constraint chiller_items_baby_id_fkey
  foreign key (baby_id) references public.babies (id) on delete set null;

comment on column public.chiller_items.baby_id is
  'Optional baby for milk. Null for family milk and for every pump-parts item.';

alter table public.reminders
  alter column baby_id drop not null;

update public.chiller_items
set baby_id = null
where type = 'pump_parts';

alter table public.reminders disable trigger reminders_prepare;

update public.reminders
set baby_id = null
where reminder_type = 'pump_parts';

alter table public.reminders enable trigger reminders_prepare;

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
      reminder_type <> 'pump_parts'
      and chiller_item_id is null
      and baby_id is not null
    )
  );

comment on column public.reminders.baby_id is
  'The baby a care reminder belongs to. Null for a pump-parts wash reminder.';

alter table public.babies
  add column photo_path text;

comment on column public.babies.photo_path is
  'Private baby-photos object path. Set from the family profile, not from Home.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'baby-photos',
  'baby-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy baby_photos_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'baby-photos'
  and (select private.is_family_member(((storage.foldername(name))[1])::uuid))
);

create policy baby_photos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'baby-photos'
  and (select private.can_write_family(((storage.foldername(name))[1])::uuid))
);

create policy baby_photos_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'baby-photos'
  and (select private.can_write_family(((storage.foldername(name))[1])::uuid))
)
with check (
  bucket_id = 'baby-photos'
  and (select private.can_write_family(((storage.foldername(name))[1])::uuid))
);

create policy baby_photos_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'baby-photos'
  and (select private.can_write_family(((storage.foldername(name))[1])::uuid))
);
