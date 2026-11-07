-- Let the creator read the family row they just inserted, so insert ... returning
-- (supabase-js .insert().select()) passes RLS before the owner membership trigger runs.
drop policy if exists families_select on public.families;

create policy families_select
on public.families
for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.is_family_member(id))
);
