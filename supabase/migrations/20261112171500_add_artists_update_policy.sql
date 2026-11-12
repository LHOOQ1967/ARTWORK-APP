create policy artists_update_admin_editor
  on public.artists
  for update
  to authenticated
  using (security.is_admin_or_editor())
  with check (security.is_admin_or_editor());
