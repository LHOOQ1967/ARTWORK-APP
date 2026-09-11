-- Speeds up the "Search all book fields" ILIKE '%term%' queries, which can't use
-- regular B-tree indexes since the search term isn't anchored to the start of the value.
create extension if not exists pg_trgm;

create index if not exists library_books_title_trgm_idx
  on public.library_books using gin (title gin_trgm_ops);

create index if not exists library_books_isbn_trgm_idx
  on public.library_books using gin (isbn gin_trgm_ops);

create index if not exists library_books_search_author_trgm_idx
  on public.library_books using gin (search_author gin_trgm_ops);

create index if not exists library_books_search_artist_trgm_idx
  on public.library_books using gin (search_artist gin_trgm_ops);

create index if not exists library_books_search_publisher_trgm_idx
  on public.library_books using gin (search_publisher gin_trgm_ops);

create index if not exists library_books_search_exhibition_trgm_idx
  on public.library_books using gin (search_exhibition gin_trgm_ops);

create index if not exists library_authors_first_name_trgm_idx
  on public.library_authors using gin (first_name gin_trgm_ops);

create index if not exists library_authors_last_name_trgm_idx
  on public.library_authors using gin (last_name gin_trgm_ops);

create index if not exists library_related_names_name_trgm_idx
  on public.library_related_names using gin (name gin_trgm_ops);

create index if not exists artists_first_name_trgm_idx
  on public.artists using gin (first_name gin_trgm_ops);

create index if not exists artists_last_name_trgm_idx
  on public.artists using gin (last_name gin_trgm_ops);
