create table public.library_book_types (
  legacy_no integer primary key,
  type_number text,
  description text,
  full_name text
);

create table public.library_statuses (
  legacy_no integer primary key,
  label text not null
);

alter table public.library_book_types enable row level security;
alter table public.library_statuses enable row level security;

create policy library_book_types_select_authenticated
  on public.library_book_types for select to authenticated using (true);
create policy library_statuses_select_authenticated
  on public.library_statuses for select to authenticated using (true);

create policy library_book_types_write_admin_editor
  on public.library_book_types for insert to authenticated
  with check (security.is_admin_or_editor());
create policy library_book_types_update_admin_editor
  on public.library_book_types for update to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_book_types_delete_admin_editor
  on public.library_book_types for delete to authenticated
  using (security.is_admin_or_editor());
create policy library_statuses_write_admin_editor
  on public.library_statuses for insert to authenticated
  with check (security.is_admin_or_editor());
create policy library_statuses_update_admin_editor
  on public.library_statuses for update to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_statuses_delete_admin_editor
  on public.library_statuses for delete to authenticated
  using (security.is_admin_or_editor());

grant select on public.library_book_types, public.library_statuses to authenticated;
grant all on public.library_book_types, public.library_statuses to service_role;