-- Phase 4. Not applied to the hosted database.
-- Display names for log attribution, and per-member alert choices.
-- Invite links stay single-use, expire within 7 days, and cannot grant owner.

alter table public.family_members
  add column display_name text;

alter table public.family_members
  add constraint family_members_display_name_not_blank check (
    display_name is null or char_length(btrim(display_name)) > 0
  );

comment on column public.family_members.display_name is
  'Name shown on logs this member writes. Defaults to the email name.';

update public.family_members as member
set display_name = nullif(split_part(users.email, '@', 1), '')
from auth.users as users
where users.id = member.user_id
  and member.display_name is null;

create or replace function private.set_member_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text;
begin
  if new.display_name is not null and char_length(btrim(new.display_name)) > 0 then
    new.display_name := btrim(new.display_name);
    return new;
  end if;

  select nullif(split_part(users.email, '@', 1), '')
  into label
  from auth.users as users
  where users.id = new.user_id;

  new.display_name := label;
  return new;
end;
$$;

create trigger family_members_display_name
before insert on public.family_members
for each row
execute function private.set_member_display_name();

create or replace function private.protect_family_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.family_id := old.family_id;
  new.created_at := old.created_at;

  if old.role = 'owner' or not private.is_family_owner(old.family_id) then
    new.role := old.role;
  end if;

  if new.display_name is null or char_length(btrim(new.display_name)) = 0 then
    new.display_name := old.display_name;
  else
    new.display_name := btrim(new.display_name);
  end if;

  return new;
end;
$$;

create trigger family_members_protect
before update on public.family_members
for each row
execute function private.protect_family_member();

create policy family_members_update_self
on public.family_members
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter table public.member_settings
  add column alert_diaper boolean not null default true,
  add column alert_feed boolean not null default true,
  add column alert_pump boolean not null default true,
  add column alert_milk boolean not null default true,
  add column alert_parts boolean not null default true;

comment on column public.member_settings.alert_diaper is
  'When false, this member is skipped for diaper reminders.';
comment on column public.member_settings.alert_feed is
  'When false, this member is skipped for feed reminders.';
comment on column public.member_settings.alert_pump is
  'When false, this member is skipped for pump reminders.';
comment on column public.member_settings.alert_milk is
  'When false, this member is skipped for milk-expiry alerts.';
comment on column public.member_settings.alert_parts is
  'When false, this member is skipped for pump-part wash alerts.';

revoke all on function private.set_member_display_name() from public, anon, authenticated;
revoke all on function private.protect_family_member() from public, anon, authenticated;
