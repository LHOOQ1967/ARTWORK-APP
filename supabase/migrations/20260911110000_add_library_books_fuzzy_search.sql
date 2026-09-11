-- Improves book search relevance: matches multiple words even when each one belongs to a
-- different field (e.g. an artist name and an author name typed together), and tolerates
-- small typos via trigram similarity, instead of requiring the whole phrase in one column.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent() is STABLE, not IMMUTABLE, so it can't be used directly in a generated column;
-- explicitly naming the dictionary makes the result deterministic enough to wrap as IMMUTABLE.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select unaccent('unaccent', coalesce($1, ''))
$$;

alter table public.library_books
  add column if not exists search_blob text generated always as (
    public.immutable_unaccent(
      coalesce(title, '') || ' ' ||
      coalesce(isbn, '') || ' ' ||
      coalesce(search_author, '') || ' ' ||
      coalesce(search_artist, '') || ' ' ||
      coalesce(search_publisher, '') || ' ' ||
      coalesce(search_exhibition, '') || ' ' ||
      coalesce(series, '') || ' ' ||
      coalesce(volume, '') || ' ' ||
      coalesce(copy, '') || ' ' ||
      coalesce(remarks, '') || ' ' ||
      coalesce(legacy_no::text, '')
    )
  ) stored;

create index if not exists library_books_search_blob_trgm_idx
  on public.library_books using gin (search_blob gin_trgm_ops);

-- Returns book ids matching every whitespace-separated word of search_query (order-independent,
-- can span different fields), falling back to trigram similarity per word to tolerate typos.
create or replace function public.search_library_book_ids(search_query text, max_results int default 5000)
returns setof uuid
language sql
stable
as $$
  with tokens as (
    select distinct public.immutable_unaccent(trim(token)) as token
    from unnest(string_to_array(coalesce(trim(search_query), ''), ' ')) as token
    where trim(token) <> ''
  )
  select b.id
  from public.library_books b
  where (select count(*) from tokens) = 0
     or (
       select bool_and(
         b.search_blob ilike '%' || tok.token || '%'
         or similarity(b.search_blob, tok.token) > 0.28
       )
       from tokens tok
     )
  order by b.legacy_no desc
  limit max_results
$$;

grant execute on function public.immutable_unaccent(text) to authenticated;
grant execute on function public.search_library_book_ids(text, int) to authenticated;
