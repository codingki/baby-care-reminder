-- Phase 0 schema for Baby Care Reminder.
--
-- Apply this with the Supabase CLI against the linked project when you are
-- ready. This file is not applied by the app itself.
--
-- The Data API roles are `anon` and `authenticated`. RLS is enabled on every
-- table. `anon` has no table privileges. Privileged helpers live in the
-- `private` schema, which is not listed in supabase/config.toml `api.schemas`,
-- so PostgREST does not expose them.
--
-- Table owners bypass RLS unless FORCE ROW LEVEL SECURITY is set. FORCE is
-- intentionally off so the security-definer trigger that creates the owner
-- membership can insert that first row. API requests still run as `anon` or
-- `authenticated` and do not bypass RLS.
--
-- Do not put a service-role key in the client. The service role bypasses RLS.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.family_role as enum ('owner', 'caregiver', 'viewer');

create type public.baby_sex as enum ('female', 'male', 'unspecified');

create type public.log_kind as enum ('diaper', 'feed', 'pump');

create type public.diaper_kind as enum ('wet', 'dirty', 'mixed', 'dry');

create type public.feed_kind as enum ('bottle');

create type public.storage_location as enum (
  'room',
  'fridge',
  'freezer',
  'cooler',
  'thawed'
);

create type public.chiller_item_type as enum ('milk', 'pump_parts');

create type public.reminder_type as enum ('diaper', 'feed', 'pump', 'pump_parts');

create type public.reminder_audience as enum ('family', 'caregivers');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  pump_parts_wash_by_hours integer not null default 24,
  constraint families_name_not_blank check (char_length(btrim(name)) > 0),
  constraint families_wash_by_hours_range check (
    pump_parts_wash_by_hours between 1 and 24
  )
);

comment on table public.families is
  'A household that shares one or more babies.';
comment on column public.families.pump_parts_wash_by_hours is
  'Hours pump parts may stay in the chiller before they must be washed. Default 24, range 1 to 24.';

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.family_role not null,
  created_at timestamptz not null default now(),
  constraint family_members_family_user_key unique (family_id, user_id)
);

comment on table public.family_members is
  'Membership of an auth user in a family. Roles: owner, caregiver, viewer.';

create index family_members_user_id_idx on public.family_members (user_id);

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  birth_date date not null,
  sex public.baby_sex not null default 'unspecified',
  weight_grams integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint babies_name_not_blank check (char_length(btrim(name)) > 0),
  constraint babies_weight_positive check (
    weight_grams is null or weight_grams > 0
  )
);

comment on table public.babies is 'Baby profile shared by a family.';
comment on column public.babies.weight_grams is 'Latest known weight in grams.';

create index babies_family_id_idx on public.babies (family_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  email text,
  role public.family_role not null,
  token text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  constraint invites_token_key unique (token),
  constraint invites_role_not_owner check (role in ('caregiver', 'viewer')),
  constraint invites_expire_within_7_days check (
    expires_at > created_at
    and expires_at <= created_at + interval '7 days'
  ),
  constraint invites_single_use check (
    (used_at is null and used_by is null)
    or (used_at is not null and used_by is not null)
  )
);

comment on table public.invites is
  'Single-use family invites. Each row expires at most 7 days after it is created.';

create index invites_family_id_idx on public.invites (family_id);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  logged_by uuid references auth.users (id) on delete set null,
  kind public.log_kind not null,
  occurred_at timestamptz not null default now(),
  notes text,
  diaper_kind public.diaper_kind,
  feed_kind public.feed_kind,
  amount_ml integer,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  constraint logs_amount_nonnegative check (amount_ml is null or amount_ml >= 0),
  constraint logs_duration_nonnegative check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint logs_kind_fields check (
    (
      kind = 'diaper'
      and diaper_kind is not null
      and feed_kind is null
      and amount_ml is null
      and duration_seconds is null
    )
    or (
      kind = 'feed'
      and feed_kind = 'bottle'
      and amount_ml is not null
      and amount_ml > 0
      and diaper_kind is null
      and duration_seconds is null
    )
    or (
      kind = 'pump'
      and diaper_kind is null
      and feed_kind is null
      and amount_ml is not null
      and amount_ml > 0
      and duration_seconds is not null
      and duration_seconds > 0
    )
  )
);

comment on table public.logs is
  'Diaper, bottle feed in millilitres, and pump events for a baby.';
comment on column public.logs.amount_ml is
  'Bottle volume, or the single total pumped volume, in millilitres.';
comment on column public.logs.duration_seconds is
  'How long the pump session lasted, in seconds.';

create index logs_baby_occurred_idx on public.logs (baby_id, occurred_at desc);
create index logs_family_id_idx on public.logs (family_id);

create table public.pump_models (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  sort_order integer not null,
  constraint pump_models_brand_model_key unique (brand, model),
  constraint pump_models_brand_not_blank check (char_length(btrim(brand)) > 0),
  constraint pump_models_model_not_blank check (char_length(btrim(model)) > 0)
);

comment on table public.pump_models is
  'Catalog of pump brands and models. Readable by any signed-in user.';

insert into public.pump_models (brand, model, sort_order)
values
  ('Medela', 'Pump In Style MaxFlow', 10),
  ('Medela', 'Freestyle Flex', 20),
  ('Medela', 'Swing Maxi', 30),
  ('Medela', 'Solo', 40),
  ('Medela', 'Harmony (manual)', 50),
  ('Momcozy', 'S12 Pro', 60),
  ('Momcozy', 'S9 Pro', 70),
  ('Momcozy', 'M5', 80),
  ('Momcozy', 'M9', 90),
  ('Momcozy', 'V1 Pro', 100),
  ('Momcozy', 'V2 Pro', 110),
  ('Momcozy', 'Air 1', 120);

create table public.family_pumps (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  pump_model_id uuid references public.pump_models (id) on delete restrict,
  custom_name text,
  nickname text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint family_pumps_identity check (
    (
      pump_model_id is not null
      and custom_name is null
    )
    or (
      pump_model_id is null
      and custom_name is not null
      and char_length(btrim(custom_name)) > 0
    )
  ),
  constraint family_pumps_nickname check (
    nickname is null or char_length(btrim(nickname)) > 0
  )
);

comment on table public.family_pumps is
  'Pumps a family owns. pump_model_id is null when custom_name is a custom pump.';
comment on column public.family_pumps.custom_name is
  'Set only for a custom pump that is not in pump_models.';
comment on column public.family_pumps.last_used_at is
  'Updated when pump parts from this pump are stored in the chiller.';

create index family_pumps_family_id_idx on public.family_pumps (family_id);
create index family_pumps_last_used_idx
  on public.family_pumps (family_id, last_used_at desc nulls last);

alter table public.logs
  add column pump_id uuid references public.family_pumps (id) on delete set null;

alter table public.logs drop constraint logs_kind_fields;

alter table public.logs
  add constraint logs_kind_fields check (
    (
      kind = 'diaper'
      and diaper_kind is not null
      and feed_kind is null
      and amount_ml is null
      and duration_seconds is null
      and pump_id is null
    )
    or (
      kind = 'feed'
      and feed_kind = 'bottle'
      and amount_ml is not null
      and amount_ml > 0
      and diaper_kind is null
      and duration_seconds is null
      and pump_id is null
    )
    or (
      kind = 'pump'
      and diaper_kind is null
      and feed_kind is null
      and amount_ml is not null
      and amount_ml > 0
      and duration_seconds is not null
      and duration_seconds > 0
      and pump_id is not null
    )
  );

comment on column public.logs.pump_id is
  'The owned pump used for a pump log. One total amount, no per-side split.';

create index logs_pump_id_idx on public.logs (pump_id);

create table public.chiller_items (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  type public.chiller_item_type not null,
  location public.storage_location not null,
  stored_at timestamptz not null default now(),
  expires_at timestamptz not null,
  pump_id uuid references public.family_pumps (id) on delete set null,
  volume_ml integer,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chiller_items_expiry_after_storage check (expires_at > stored_at),
  constraint chiller_items_volume check (
    (
      type = 'milk'
      and (volume_ml is null or volume_ml > 0)
    )
    or (
      type = 'pump_parts'
      and volume_ml is null
    )
  )
);

comment on table public.chiller_items is
  'Chiller contents: milk or pump parts, with a storage countdown.';
comment on column public.chiller_items.location is
  'room, fridge, freezer, cooler, or thawed.';
comment on column public.chiller_items.volume_ml is
  'Milk volume in millilitres. Null for pump parts, and optional for milk.';
comment on column public.chiller_items.pump_id is
  'Owned pump whose parts are chilling. Null for milk, and optional if the pump was removed.';

create index chiller_items_baby_expires_idx
  on public.chiller_items (baby_id, expires_at);
create index chiller_items_family_id_idx on public.chiller_items (family_id);
create index chiller_items_pump_id_idx on public.chiller_items (pump_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  reminder_type public.reminder_type not null,
  next_due_at timestamptz not null,
  enabled boolean not null default true,
  audience public.reminder_audience not null default 'family',
  chiller_item_id uuid references public.chiller_items (id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint reminders_shape check (
    (
      reminder_type = 'pump_parts'
      and chiller_item_id is not null
      and audience = 'caregivers'
    )
    or (
      reminder_type <> 'pump_parts'
      and chiller_item_id is null
    )
  )
);

comment on table public.reminders is
  'Schedule rows are one per baby and type. A pump-parts chiller item adds its own reminder, due shortly before expires_at, for every owner and caregiver.';
comment on column public.reminders.audience is
  'caregivers notifies owners and caregivers. family includes every member.';

create unique index reminders_schedule_key
  on public.reminders (baby_id, reminder_type)
  where chiller_item_id is null;

create unique index reminders_chiller_item_key
  on public.reminders (chiller_item_id)
  where chiller_item_id is not null;

create index reminders_family_id_idx on public.reminders (family_id);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_secrets_not_blank check (
    char_length(btrim(endpoint)) > 0
    and char_length(btrim(p256dh)) > 0
    and char_length(btrim(auth_key)) > 0
  )
);

comment on table public.push_subscriptions is
  'Web Push subscriptions. Sending pushes is not part of phase 0.';
comment on column public.push_subscriptions.auth_key is
  'Web Push auth secret from PushSubscription.keys.auth.';

create index push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create table public.member_settings (
  id uuid primary key default gen_random_uuid(),
  family_member_id uuid not null references public.family_members (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'UTC',
  language text not null default 'en',
  unit text not null default 'ml',
  snooze_until timestamptz,
  snooze_minutes integer not null default 15,
  updated_at timestamptz not null default now(),
  constraint member_settings_member_key unique (family_member_id),
  constraint member_settings_snooze_positive check (snooze_minutes > 0),
  constraint member_settings_timezone_not_blank check (
    char_length(btrim(timezone)) > 0
  ),
  constraint member_settings_language_check check (language in ('en', 'id')),
  constraint member_settings_unit_check check (unit = 'ml'),
  constraint member_settings_quiet_hours_pair check (
    quiet_hours_enabled = false
    or (
      quiet_hours_start is not null
      and quiet_hours_end is not null
    )
  )
);

comment on table public.member_settings is
  'Per-member quiet hours, snooze, language, and volume unit. One row per family membership.';
comment on column public.member_settings.language is
  'UI language for this member: en (English) or id (Bahasa Indonesia). Defaults to en.';
comment on column public.member_settings.unit is
  'Volume unit for feeds and milk in the chiller. Defaults to ml. Phase 0 allows ml only.';

create index member_settings_user_id_idx on public.member_settings (user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- security definer reads membership without re-entering RLS.
-- ---------------------------------------------------------------------------

create or replace function private.is_family_member(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members as member
    where member.family_id = target_family
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.family_role(target_family uuid)
returns public.family_role
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.family_members as member
  where member.family_id = target_family
    and member.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.can_write_family(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.family_role(target_family) in ('owner', 'caregiver');
$$;

create or replace function private.is_family_owner(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.family_role(target_family) = 'owner';
$$;

create or replace function private.baby_family_id(target_baby uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select baby.family_id
  from public.babies as baby
  where baby.id = target_baby;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.family_members (family_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger families_add_owner
after insert on public.families
for each row
execute function private.handle_new_family();

create or replace function private.handle_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_settings (family_member_id, user_id, family_id)
  values (new.id, new.user_id, new.family_id);
  return new;
end;
$$;

create trigger family_members_add_settings
after insert on public.family_members
for each row
execute function private.handle_new_member();

create or replace function private.lock_family_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not private.is_family_owner(old.id) then
    new.name := old.name;
  end if;
  return new;
end;
$$;

create trigger families_lock_creator
before update on public.families
for each row
execute function private.lock_family_creator();

create or replace function private.prepare_baby()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > current_date then
    raise exception 'birth date cannot be in the future';
  end if;

  if tg_op = 'UPDATE' then
    new.family_id := old.family_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger babies_prepare
before insert or update on public.babies
for each row
execute function private.prepare_baby();

create or replace function private.prepare_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is not null then
    new.email := nullif(lower(btrim(new.email)), '');
  end if;

  new.token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');
  new.used_at := null;
  new.used_by := null;

  if new.expires_at is null
    or new.expires_at > new.created_at + interval '7 days'
  then
    new.expires_at := new.created_at + interval '7 days';
  end if;

  return new;
end;
$$;

create trigger invites_prepare
before insert on public.invites
for each row
execute function private.prepare_invite();

create or replace function private.prepare_log()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  baby_family uuid;
  pump_family uuid;
begin
  baby_family := private.baby_family_id(new.baby_id);
  if baby_family is null then
    raise exception 'invalid baby';
  end if;

  new.family_id := baby_family;

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
    new.logged_by := old.logged_by;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

create trigger logs_prepare
before insert or update on public.logs
for each row
execute function private.prepare_log();

create or replace function private.prepare_family_pump()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.family_id := old.family_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger family_pumps_prepare
before insert or update on public.family_pumps
for each row
execute function private.prepare_family_pump();

create or replace function private.prepare_chiller_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  baby_family uuid;
  pump_family uuid;
begin
  baby_family := private.baby_family_id(new.baby_id);
  if baby_family is null then
    raise exception 'invalid baby';
  end if;

  new.family_id := baby_family;

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

create trigger chiller_items_prepare
before insert or update on public.chiller_items
for each row
execute function private.prepare_chiller_item();

-- One reminder per pump-parts item, due 30 minutes before it expires,
-- for owners and caregivers. Milk items do not create this reminder.
create or replace function private.sync_pump_parts_reminder()
returns trigger
language plpgsql
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
    chiller_item_id
  )
  values (
    new.baby_id,
    new.family_id,
    'pump_parts',
    due_at,
    'caregivers',
    new.id
  )
  on conflict (chiller_item_id) where chiller_item_id is not null
  do update
    set
      next_due_at = excluded.next_due_at,
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

create trigger chiller_items_sync_reminder
after insert or update on public.chiller_items
for each row
execute function private.sync_pump_parts_reminder();

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

  baby_family := private.baby_family_id(new.baby_id);
  if baby_family is null then
    raise exception 'invalid baby';
  end if;

  new.family_id := baby_family;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reminders_prepare
before insert or update on public.reminders
for each row
execute function private.prepare_reminder();

create or replace function private.lock_member_settings_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.family_member_id := old.family_member_id;
  new.user_id := old.user_id;
  new.family_id := old.family_id;
  new.updated_at := now();
  return new;
end;
$$;

create trigger member_settings_lock_identity
before update on public.member_settings
for each row
execute function private.lock_member_settings_identity();

-- Marks a single-use invite as consumed and adds the signed-in user.
-- Runs as the definer so a person who is not yet a member can join.
create or replace function private.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.invites%rowtype;
  existing_member public.family_members%rowtype;
  member_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if invite_token is null or char_length(invite_token) < 32 then
    raise exception 'invite not found';
  end if;

  select *
  into invite_row
  from public.invites
  where token = invite_token
  for update;

  if not found then
    raise exception 'invite not found';
  end if;

  if invite_row.used_at is not null then
    raise exception 'invite already used';
  end if;

  if invite_row.expires_at <= now() then
    raise exception 'invite expired';
  end if;

  select *
  into existing_member
  from public.family_members
  where family_id = invite_row.family_id
    and user_id = (select auth.uid());

  if found then
    member_id := existing_member.id;
    if existing_member.role <> 'owner'
      and existing_member.role is distinct from invite_row.role
    then
      update public.family_members
      set role = invite_row.role
      where id = existing_member.id;
    end if;
  else
    insert into public.family_members (family_id, user_id, role)
    values (invite_row.family_id, (select auth.uid()), invite_row.role)
    returning id into member_id;
  end if;

  update public.invites
  set
    used_at = now(),
    used_by = (select auth.uid())
  where id = invite_row.id;

  return invite_row.family_id;
end;
$$;

-- Invoker wrapper in the exposed schema. The privileged work stays in private.
create or replace function public.accept_invite(invite_token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_invite(invite_token);
$$;

comment on function public.accept_invite(text) is
  'Accept a single-use family invite for the signed-in user.';

revoke all on function private.is_family_member(uuid) from public, anon;
revoke all on function private.family_role(uuid) from public, anon;
revoke all on function private.can_write_family(uuid) from public, anon;
revoke all on function private.is_family_owner(uuid) from public, anon;
revoke all on function private.baby_family_id(uuid) from public, anon;
revoke all on function private.handle_new_family() from public, anon;
revoke all on function private.handle_new_member() from public, anon;
revoke all on function private.lock_family_creator() from public, anon;
revoke all on function private.prepare_baby() from public, anon;
revoke all on function private.prepare_invite() from public, anon;
revoke all on function private.prepare_log() from public, anon;
revoke all on function private.prepare_family_pump() from public, anon;
revoke all on function private.prepare_chiller_item() from public, anon;
revoke all on function private.sync_pump_parts_reminder() from public, anon;
revoke all on function private.prepare_reminder() from public, anon;
revoke all on function private.lock_member_settings_identity() from public, anon;
revoke all on function private.accept_invite(text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;

grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.family_role(uuid) to authenticated;
grant execute on function private.can_write_family(uuid) to authenticated;
grant execute on function private.is_family_owner(uuid) to authenticated;
grant execute on function private.baby_family_id(uuid) to authenticated;
grant execute on function private.handle_new_family() to authenticated;
grant execute on function private.handle_new_member() to authenticated;
grant execute on function private.lock_family_creator() to authenticated;
grant execute on function private.prepare_baby() to authenticated;
grant execute on function private.prepare_invite() to authenticated;
grant execute on function private.prepare_log() to authenticated;
grant execute on function private.prepare_family_pump() to authenticated;
grant execute on function private.prepare_chiller_item() to authenticated;
grant execute on function private.sync_pump_parts_reminder() to authenticated;
grant execute on function private.prepare_reminder() to authenticated;
grant execute on function private.lock_member_settings_identity() to authenticated;
grant execute on function private.accept_invite(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.invites enable row level security;
alter table public.logs enable row level security;
alter table public.pump_models enable row level security;
alter table public.family_pumps enable row level security;
alter table public.chiller_items enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.member_settings enable row level security;

create policy families_select
on public.families
for select
to authenticated
using ((select private.is_family_member(id)));

create policy families_insert
on public.families
for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy families_update
on public.families
for update
to authenticated
using ((select private.can_write_family(id)))
with check ((select private.can_write_family(id)));

create policy families_delete
on public.families
for delete
to authenticated
using ((select private.is_family_owner(id)));

create policy family_members_select
on public.family_members
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy family_members_insert
on public.family_members
for insert
to authenticated
with check (
  (select private.is_family_owner(family_id))
  and role in ('caregiver', 'viewer')
  and user_id <> (select auth.uid())
);

create policy family_members_update
on public.family_members
for update
to authenticated
using ((select private.is_family_owner(family_id)))
with check (
  (select private.is_family_owner(family_id))
  and role in ('caregiver', 'viewer')
);

create policy family_members_delete
on public.family_members
for delete
to authenticated
using (
  (
    (select private.is_family_owner(family_id))
    and user_id <> (select auth.uid())
  )
  or (
    user_id = (select auth.uid())
    and role <> 'owner'
  )
);

create policy babies_select
on public.babies
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy babies_insert
on public.babies
for insert
to authenticated
with check ((select private.can_write_family(family_id)));

create policy babies_update
on public.babies
for update
to authenticated
using ((select private.can_write_family(family_id)))
with check ((select private.can_write_family(family_id)));

create policy babies_delete
on public.babies
for delete
to authenticated
using ((select private.can_write_family(family_id)));

create policy invites_select
on public.invites
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy invites_insert
on public.invites
for insert
to authenticated
with check (
  (select private.can_write_family(family_id))
  and created_by = (select auth.uid())
  and role in ('caregiver', 'viewer')
  and used_at is null
  and used_by is null
  and expires_at <= (select now()) + interval '7 days'
);

create policy invites_delete
on public.invites
for delete
to authenticated
using (
  (select private.can_write_family(family_id))
  and used_at is null
);

create policy logs_select
on public.logs
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy logs_insert
on public.logs
for insert
to authenticated
with check (
  (select private.can_write_family(family_id))
  and logged_by = (select auth.uid())
);

create policy logs_update
on public.logs
for update
to authenticated
using ((select private.can_write_family(family_id)))
with check ((select private.can_write_family(family_id)));

create policy logs_delete
on public.logs
for delete
to authenticated
using ((select private.can_write_family(family_id)));

create policy pump_models_select
on public.pump_models
for select
to authenticated
using (true);

create policy family_pumps_select
on public.family_pumps
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy family_pumps_insert
on public.family_pumps
for insert
to authenticated
with check ((select private.can_write_family(family_id)));

create policy family_pumps_update
on public.family_pumps
for update
to authenticated
using ((select private.can_write_family(family_id)))
with check ((select private.can_write_family(family_id)));

create policy family_pumps_delete
on public.family_pumps
for delete
to authenticated
using ((select private.can_write_family(family_id)));

create policy chiller_items_select
on public.chiller_items
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy chiller_items_insert
on public.chiller_items
for insert
to authenticated
with check (
  (select private.can_write_family(family_id))
  and created_by = (select auth.uid())
);

create policy chiller_items_update
on public.chiller_items
for update
to authenticated
using ((select private.can_write_family(family_id)))
with check ((select private.can_write_family(family_id)));

create policy chiller_items_delete
on public.chiller_items
for delete
to authenticated
using ((select private.can_write_family(family_id)));

create policy reminders_select
on public.reminders
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy reminders_insert
on public.reminders
for insert
to authenticated
with check ((select private.can_write_family(family_id)));

create policy reminders_update
on public.reminders
for update
to authenticated
using ((select private.can_write_family(family_id)))
with check ((select private.can_write_family(family_id)));

create policy reminders_delete
on public.reminders
for delete
to authenticated
using ((select private.can_write_family(family_id)));

create policy push_subscriptions_select
on public.push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy push_subscriptions_insert
on public.push_subscriptions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (
    family_id is null
    or (select private.is_family_member(family_id))
  )
);

create policy push_subscriptions_update
on public.push_subscriptions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (
    family_id is null
    or (select private.is_family_member(family_id))
  )
);

create policy push_subscriptions_delete
on public.push_subscriptions
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy member_settings_select
on public.member_settings
for select
to authenticated
using (user_id = (select auth.uid()));

create policy member_settings_update
on public.member_settings
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Cloud projects grant new public tables to anon and authenticated by default.
-- Take that back, then grant the signed-in role only what RLS will filter.
revoke all on table
  public.families,
  public.family_members,
  public.babies,
  public.invites,
  public.logs,
  public.pump_models,
  public.family_pumps,
  public.chiller_items,
  public.reminders,
  public.push_subscriptions,
  public.member_settings
from public, anon;

grant select, insert, update, delete on table
  public.families,
  public.family_members,
  public.babies,
  public.invites,
  public.logs,
  public.family_pumps,
  public.chiller_items,
  public.reminders,
  public.push_subscriptions,
  public.member_settings
to authenticated;

grant select on table public.pump_models to authenticated;
