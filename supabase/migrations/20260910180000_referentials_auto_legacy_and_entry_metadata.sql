-- Auto legacy numbers for post-import referential records.
-- Also add entry metadata to display Entered at / Entered by consistently.

create sequence if not exists public.library_authors_legacy_no_seq
  start with 1000000
  increment by 1;

select setval(
  'public.library_authors_legacy_no_seq',
  greatest(
    999999,
    coalesce((select max(legacy_no) from public.library_authors), 999999) + 1
  ) - 1
);

alter table public.library_authors
  alter column legacy_no set default nextval('public.library_authors_legacy_no_seq');

create sequence if not exists public.library_related_names_legacy_no_seq
  start with 1000000
  increment by 1;

select setval(
  'public.library_related_names_legacy_no_seq',
  greatest(
    999999,
    coalesce((select max(legacy_no) from public.library_related_names), 999999) + 1
  ) - 1
);

alter table public.library_related_names
  alter column legacy_no set default nextval('public.library_related_names_legacy_no_seq');

create sequence if not exists public.library_book_types_legacy_no_seq
  start with 1000000
  increment by 1;

select setval(
  'public.library_book_types_legacy_no_seq',
  greatest(
    999999,
    coalesce((select max(legacy_no) from public.library_book_types), 999999) + 1
  ) - 1
);

alter table public.library_book_types
  alter column legacy_no set default nextval('public.library_book_types_legacy_no_seq');

create sequence if not exists public.artist_categories_legacy_no_seq
  start with 1000000
  increment by 1;

select setval(
  'public.artist_categories_legacy_no_seq',
  greatest(
    999999,
    coalesce((select max(legacy_no) from public.artist_categories), 999999) + 1
  ) - 1
);

alter table public.artist_categories
  alter column legacy_no set default nextval('public.artist_categories_legacy_no_seq');

alter table public.library_authors
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

alter table public.library_related_names
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

alter table public.library_book_types
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

alter table public.artist_categories
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid();

alter table public.artists
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists source text not null default 'manual';

update public.artists
set source = 'access_import'
where created_by is null
  or source is null
  or btrim(source) = '';

alter table public.artists
  add constraint artists_source_check
  check (source in ('access_import', 'manual'));

alter table public.library_authors
  add constraint library_authors_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.library_related_names
  add constraint library_related_names_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.library_book_types
  add constraint library_book_types_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.artist_categories
  add constraint artist_categories_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.artists
  add constraint artists_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

create index if not exists library_authors_created_by_idx on public.library_authors (created_by);
create index if not exists library_related_names_created_by_idx on public.library_related_names (created_by);
create index if not exists library_book_types_created_by_idx on public.library_book_types (created_by);
create index if not exists artist_categories_created_by_idx on public.artist_categories (created_by);
create index if not exists artists_created_by_idx on public.artists (created_by);
