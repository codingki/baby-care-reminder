-- Let other phones see chiller changes without a reload.
-- Not applied in this change.

alter table public.chiller_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chiller_items'
  ) then
    alter publication supabase_realtime add table public.chiller_items;
  end if;
end $$;
