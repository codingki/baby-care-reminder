-- Weight checks. The latest by date is copied onto babies.weight_grams.

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  logged_by uuid references auth.users (id) on delete set null,
  weight_grams integer not null,
  weighed_on date not null,
  created_at timestamptz not null default now(),
  constraint weight_logs_positive check (weight_grams > 0)
);

comment on table public.weight_logs is
  'Weight checks for a baby. The latest by date is stored on babies.weight_grams.';

create index weight_logs_baby_date_idx
  on public.weight_logs (baby_id, weighed_on desc, created_at desc);

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

comment on function private.sync_baby_weight() is
  'Keeps babies.weight_grams equal to the newest weight log by date.';

create trigger weight_logs_sync_baby
after insert or update or delete on public.weight_logs
for each row
execute function private.sync_baby_weight();

revoke all on function private.sync_baby_weight() from public, anon, authenticated;

alter table public.weight_logs enable row level security;

create policy weight_logs_select
on public.weight_logs
for select
to authenticated
using ((select private.is_family_member(family_id)));

create policy weight_logs_insert
on public.weight_logs
for insert
to authenticated
with check (
  (select private.can_write_family(family_id))
  and logged_by = (select auth.uid())
);

create policy weight_logs_update
on public.weight_logs
for update
to authenticated
using ((select private.can_write_family(family_id)))
with check ((select private.can_write_family(family_id)));

create policy weight_logs_delete
on public.weight_logs
for delete
to authenticated
using ((select private.can_write_family(family_id)));

revoke all on table public.weight_logs from public, anon;
grant select, insert, update, delete on table public.weight_logs to authenticated;
