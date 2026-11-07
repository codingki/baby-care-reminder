-- A birth date of "today" in a timezone ahead of the database can be
-- tomorrow in UTC. Allow that one-day window. Later dates still fail.

create or replace function private.prepare_baby()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > (current_timestamp at time zone 'utc')::date + 1 then
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
