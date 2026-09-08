update storage.buckets
set public = false
where id = 'artwork-imports';

drop policy if exists artwork_imports_storage_insert on storage.objects;
drop policy if exists artwork_imports_storage_update on storage.objects;

create policy artwork_imports_storage_insert_admin_editor
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artwork-imports'
  and security.is_admin_or_editor()
);

create policy artwork_imports_storage_select_admin_editor
on storage.objects
for select
to authenticated
using (
  bucket_id = 'artwork-imports'
  and security.is_admin_or_editor()
);

create policy artwork_imports_storage_delete_admin_editor
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artwork-imports'
  and security.is_admin_or_editor()
);