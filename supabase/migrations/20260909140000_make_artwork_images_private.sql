update storage.buckets
set public = false
where id = 'artwork-images';

create policy artwork_images_select_authenticated
on storage.objects
for select
to authenticated
using (bucket_id = 'artwork-images');