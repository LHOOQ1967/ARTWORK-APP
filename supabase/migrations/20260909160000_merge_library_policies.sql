-- Keep one SELECT policy per library table; write policies must not include SELECT.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'library_books',
    'library_authors',
    'library_book_authors',
    'library_book_artists',
    'library_related_names',
    'library_exhibitions'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_write_admin_editor', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (security.is_admin_or_editor())', table_name || '_insert_admin_editor', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (security.is_admin_or_editor()) with check (security.is_admin_or_editor())', table_name || '_update_admin_editor', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (security.is_admin_or_editor())', table_name || '_delete_admin_editor', table_name);
  end loop;
end $$;