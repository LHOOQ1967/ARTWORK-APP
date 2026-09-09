create temporary table duplicate_artist_map (
  duplicate_id uuid primary key,
  canonical_id uuid not null
) on commit drop;

insert into duplicate_artist_map (duplicate_id, canonical_id)
with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(trim(coalesce(first_name, ''))), lower(trim(last_name))
      order by id
    ) as canonical_id,
    row_number() over (
      partition by lower(trim(coalesce(first_name, ''))), lower(trim(last_name))
      order by id
    ) as name_rank
  from public.artists
  where nullif(trim(last_name), '') is not null
)
select id, canonical_id
from ranked
where name_rank > 1;

update public.artworks artwork
set artist_id = mapping.canonical_id
from duplicate_artist_map mapping
where artwork.artist_id = mapping.duplicate_id;

update public.library_book_artists book_artist
set artist_id = mapping.canonical_id
from duplicate_artist_map mapping
where book_artist.artist_id = mapping.duplicate_id;

delete from public.library_book_artists duplicate_link
using public.library_book_artists kept_link
where duplicate_link.book_id = kept_link.book_id
  and duplicate_link.artist_id = kept_link.artist_id
  and duplicate_link.legacy_artist_no > kept_link.legacy_artist_no;

delete from public.artists artist
using duplicate_artist_map mapping
where artist.id = mapping.duplicate_id;