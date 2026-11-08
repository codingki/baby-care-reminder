-- Remembers how far a member got in setup. Existing rows default to done
-- so families already in use are not sent back through onboarding.
-- Not applied in this change.

alter table public.member_settings
  add column onboarding_step smallint not null default 7;

alter table public.member_settings
  add constraint member_settings_onboarding_step_check
  check (onboarding_step between 1 and 7);

comment on column public.member_settings.onboarding_step is
  '1 name, 2 family, 3 baby, 4 pump, 5 reminders, 6 notifications, 7 done. New members start at 1, or 6 when the family already has a baby.';

create or replace function private.handle_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  starting_step smallint := 1;
begin
  if exists (
    select 1
    from public.babies as baby
    where baby.family_id = new.family_id
  ) then
    starting_step := 6;
  end if;

  insert into public.member_settings (family_member_id, user_id, family_id, onboarding_step)
  values (new.id, new.user_id, new.family_id, starting_step);

  return new;
end;
$$;
