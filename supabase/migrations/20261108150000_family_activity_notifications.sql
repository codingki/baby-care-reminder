-- Family activity pushes. A new log writes an outbox row and asks send-reminders
-- to deliver it. Edits, deletes, and undo do not insert a row.
-- Not applied here. Create the two Vault secrets, then run this migration.

create extension if not exists pg_net;

alter table public.member_settings
  add column notify_family_activity boolean not null default true;

comment on column public.member_settings.notify_family_activity is
  'When false, this member is skipped for family activity pushes. Quiet hours and snooze still apply when true.';

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  baby_id uuid references public.babies (id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  delivered_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint activity_events_kind_check check (
    kind in ('diaper', 'feed', 'pump', 'weight', 'milk', 'pump_parts')
  )
);

comment on table public.activity_events is
  'Outbox for family activity pushes. No client policies. send-reminders sets sent_at.';
comment on column public.activity_events.delivered_user_ids is
  'Members who already received this event. Quiet hours can leave sent_at null for a retry without buzzing them again.';
comment on column public.activity_events.payload is
  'Actor name, baby name, and the logged facts. The edge function writes the sentence.';

create index activity_events_unsent_idx
  on public.activity_events (created_at)
  where sent_at is null;

alter table public.activity_events enable row level security;

revoke all on table public.activity_events from public, anon, authenticated;
grant select, insert, update, delete on table public.activity_events to service_role;

create or replace function private.activity_actor_name(target_family uuid, target_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  label text;
begin
  if target_user is null then
    return '';
  end if;

  select coalesce(
    nullif(btrim(member.display_name), ''),
    nullif(split_part(users.email, '@', 1), '')
  )
  into label
  from public.family_members as member
  left join auth.users as users on users.id = member.user_id
  where member.family_id = target_family
    and member.user_id = target_user
  limit 1;

  return coalesce(label, '');
end;
$$;

create or replace function private.activity_baby_name(target_baby uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select nullif(btrim(baby.name), '')
      from public.babies as baby
      where baby.id = target_baby
    ),
    ''
  );
$$;

create or replace function private.kick_send_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bearer text;
  target text;
begin
  select ds.decrypted_secret
  into bearer
  from vault.decrypted_secrets as ds
  where ds.name = 'send_reminders_bearer'
  limit 1;

  select ds.decrypted_secret
  into target
  from vault.decrypted_secrets as ds
  where ds.name = 'send_reminders_url'
  limit 1;

  if bearer is null or target is null then
    return;
  end if;

  bearer := btrim(bearer);
  target := btrim(target);
  if bearer = '' or target = '' then
    return;
  end if;

  perform net.http_post(
    url := target,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    )
  );
end;
$$;

comment on function private.kick_send_reminders() is
  'Queues send-reminders through pg_net using Vault secrets. Missing secrets leave the outbox for cron.';

create or replace function private.enqueue_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_kind text;
  event_baby uuid;
  event_actor uuid;
  event_payload jsonb;
begin
  if tg_table_name = 'logs' then
    if new.deleted_at is not null or new.kind::text not in ('diaper', 'feed', 'pump') then
      return new;
    end if;
    event_kind := new.kind::text;
    event_baby := new.baby_id;
    event_actor := new.logged_by;
    event_payload := jsonb_build_object(
      'actor_name', private.activity_actor_name(new.family_id, new.logged_by),
      'baby_name', private.activity_baby_name(new.baby_id),
      'occurred_at', new.occurred_at,
      'created_at', new.created_at,
      'amount_ml', new.amount_ml,
      'duration_seconds', new.duration_seconds,
      'feed_kind', new.feed_kind,
      'diaper_kind', new.diaper_kind
    );
  elsif tg_table_name = 'weight_logs' then
    if new.deleted_at is not null then
      return new;
    end if;
    event_kind := 'weight';
    event_baby := new.baby_id;
    event_actor := new.logged_by;
    event_payload := jsonb_build_object(
      'actor_name', private.activity_actor_name(new.family_id, new.logged_by),
      'baby_name', private.activity_baby_name(new.baby_id),
      'weight_grams', new.weight_grams,
      'weighed_on', new.weighed_on,
      'created_at', new.created_at
    );
  elsif tg_table_name = 'chiller_items' then
    if new.deleted_at is not null then
      return new;
    end if;
    event_kind := case when new.type = 'pump_parts' then 'pump_parts' else 'milk' end;
    event_baby := new.baby_id;
    event_actor := new.created_by;
    event_payload := jsonb_build_object(
      'actor_name', private.activity_actor_name(new.family_id, new.created_by),
      'baby_name', private.activity_baby_name(new.baby_id),
      'occurred_at', new.stored_at,
      'created_at', new.created_at,
      'amount_ml', new.volume_ml
    );
  else
    return new;
  end if;

  insert into public.activity_events (family_id, actor_user_id, baby_id, kind, payload)
  values (new.family_id, event_actor, event_baby, event_kind, event_payload);

  begin
    perform private.kick_send_reminders();
  exception
    when others then
      null;
  end;

  return new;
end;
$$;

comment on function private.enqueue_activity() is
  'AFTER INSERT only. A failed kick still leaves the outbox row for the cron fallback.';

create trigger logs_enqueue_activity
after insert on public.logs
for each row
execute function private.enqueue_activity();

create trigger weight_logs_enqueue_activity
after insert on public.weight_logs
for each row
execute function private.enqueue_activity();

create trigger chiller_items_enqueue_activity
after insert on public.chiller_items
for each row
execute function private.enqueue_activity();

revoke all on function private.activity_actor_name(uuid, uuid) from public, anon, authenticated;
revoke all on function private.activity_baby_name(uuid) from public, anon, authenticated;
revoke all on function private.kick_send_reminders() from public, anon, authenticated;
revoke all on function private.enqueue_activity() from public, anon, authenticated;
