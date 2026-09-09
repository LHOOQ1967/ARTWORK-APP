create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  legacy_no integer not null unique,
  entered_at date,
  type_no integer,
  status_no integer,
  title text,
  publisher_no integer,
  publication_year integer,
  volume text,
  series text,
  remarks text,
  isbn text,
  copy text,
  search_artist text,
  search_author text,
  search_exhibition text,
  search_publisher text,
  imported_at timestamptz not null default now()
);

create table public.library_authors (
  id uuid primary key default gen_random_uuid(),
  legacy_no integer not null unique,
  last_name text,
  first_name text
);

create table public.library_book_authors (
  book_id uuid not null references public.library_books(id) on delete cascade,
  author_id uuid not null references public.library_authors(id) on delete cascade,
  is_default boolean not null default false,
  primary key (book_id, author_id)
);

create table public.library_book_artists (
  book_id uuid not null references public.library_books(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  legacy_artist_no integer not null,
  is_default boolean not null default false,
  primary key (book_id, legacy_artist_no)
);

create table public.library_related_names (
  legacy_no integer primary key,
  name text,
  location text
);

create table public.library_exhibitions (
  id uuid primary key default gen_random_uuid(),
  legacy_no integer not null unique,
  book_id uuid not null references public.library_books(id) on delete cascade,
  related_name_no integer references public.library_related_names(legacy_no) on delete set null,
  starts_on date,
  ends_on date
);

create index library_books_title_idx on public.library_books using gin (to_tsvector('simple', coalesce(title, '')));
create index library_books_isbn_idx on public.library_books (isbn);
create index library_books_year_idx on public.library_books (publication_year);
create index library_book_authors_author_idx on public.library_book_authors (author_id);
create index library_book_artists_artist_idx on public.library_book_artists (artist_id);
create index library_exhibitions_book_idx on public.library_exhibitions (book_id);

alter table public.library_books enable row level security;
alter table public.library_authors enable row level security;
alter table public.library_book_authors enable row level security;
alter table public.library_book_artists enable row level security;
alter table public.library_related_names enable row level security;
alter table public.library_exhibitions enable row level security;

create policy library_books_select_authenticated on public.library_books for select to authenticated using (true);
create policy library_authors_select_authenticated on public.library_authors for select to authenticated using (true);
create policy library_book_authors_select_authenticated on public.library_book_authors for select to authenticated using (true);
create policy library_book_artists_select_authenticated on public.library_book_artists for select to authenticated using (true);
create policy library_related_names_select_authenticated on public.library_related_names for select to authenticated using (true);
create policy library_exhibitions_select_authenticated on public.library_exhibitions for select to authenticated using (true);

create policy library_books_write_admin_editor on public.library_books for all to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_authors_write_admin_editor on public.library_authors for all to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_book_authors_write_admin_editor on public.library_book_authors for all to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_book_artists_write_admin_editor on public.library_book_artists for all to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_related_names_write_admin_editor on public.library_related_names for all to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());
create policy library_exhibitions_write_admin_editor on public.library_exhibitions for all to authenticated
  using (security.is_admin_or_editor()) with check (security.is_admin_or_editor());

grant select on public.library_books, public.library_authors, public.library_book_authors,
  public.library_book_artists, public.library_related_names, public.library_exhibitions to authenticated;
grant all on public.library_books, public.library_authors, public.library_book_authors,
  public.library_book_artists, public.library_related_names, public.library_exhibitions to service_role;