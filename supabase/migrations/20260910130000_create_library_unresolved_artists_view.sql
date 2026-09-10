create or replace view public.library_unresolved_artists
with (security_invoker = true) as
select
  lba.book_id,
  lb.legacy_no as book_legacy_no,
  lb.title as book_title,
  lb.entered_at,
  lb.search_artist,
  lba.legacy_artist_no,
  lba.is_default,
  lb.created_by
from public.library_book_artists lba
join public.library_books lb on lb.id = lba.book_id
where lba.artist_id is null;

grant select on public.library_unresolved_artists to authenticated;
