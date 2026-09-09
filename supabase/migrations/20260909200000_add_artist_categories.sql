create table public.artist_categories (
  legacy_no integer primary key,
  description text not null,
  definition text
);

alter table public.artists
  add column artist_category_no integer references public.artist_categories(legacy_no) on delete set null;

create index artists_category_no_idx on public.artists (artist_category_no);

alter table public.artist_categories enable row level security;

create policy artist_categories_select_authenticated
  on public.artist_categories for select to authenticated using (true);

create policy artist_categories_insert_admin_editor
  on public.artist_categories for insert to authenticated
  with check (security.is_admin_or_editor());
create policy artist_categories_update_admin_editor
  on public.artist_categories for update to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy artist_categories_delete_admin_editor
  on public.artist_categories for delete to authenticated
  using (security.is_admin_or_editor());

grant select on public.artist_categories to authenticated;
grant all on public.artist_categories to service_role;
