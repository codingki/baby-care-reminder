-- Baby photos. The bucket is private. Objects are family_id/baby_id/uuid.webp.
-- photo_path may already exist from 20261107140000_chiller_baby_optional.sql.

alter table public.babies
  add column if not exists photo_path text;

comment on column public.babies.photo_path is
  'Path in the private baby-photos bucket: family_id/baby_id/uuid.webp. Null when the baby has no photo.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'baby-photos',
  'baby-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists baby_photos_select on storage.objects;
drop policy if exists baby_photos_insert on storage.objects;
drop policy if exists baby_photos_update on storage.objects;
drop policy if exists baby_photos_delete on storage.objects;

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
