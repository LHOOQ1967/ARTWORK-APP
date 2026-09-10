create policy artists_delete_admin_editor
  on public.artists
  for delete
  to authenticated
  using (security.is_admin_or_editor());
