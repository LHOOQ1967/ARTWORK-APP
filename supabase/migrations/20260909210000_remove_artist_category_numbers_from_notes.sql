-- TDACategorie was initially imported into artists.notes by mistake.
-- Remove only numeric notes that match a valid imported artist category.
update public.artists artist
set notes = null
where artist.notes ~ '^[0-9]+$'
  and exists (
    select 1
    from public.artist_categories category
    where category.legacy_no = artist.notes::integer
  );
