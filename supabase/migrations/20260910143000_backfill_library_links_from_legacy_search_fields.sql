-- Backfill missing library links from legacy text fields.
-- Idempotent: only inserts links that do not already exist.

with author_names as (
  select
    a.id as author_id,
    lower(regexp_replace(btrim(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))), '\\s+', ' ', 'g')) as normalized_name
  from public.library_authors a
  union all
  select
    a.id as author_id,
    lower(regexp_replace(btrim(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))), '\\s+', ' ', 'g')) as normalized_name
  from public.library_authors a
),
author_name_unique as (
  select
    an.normalized_name,
    (array_agg(an.author_id order by an.author_id))[1] as author_id,
    count(distinct an.author_id) as author_count
  from author_names an
  group by an.normalized_name
),
author_tokens as (
  select
    lb.id as book_id,
    t.ordinality as token_pos,
    lower(regexp_replace(btrim(t.token), '\\s+', ' ', 'g')) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(coalesce(lb.search_author, ''), '[,;]') with ordinality as t(token, ordinality)
  where btrim(coalesce(lb.search_author, '')) <> ''
    and btrim(t.token) <> ''
),
author_matched as (
  select
    at.book_id,
    at.token_pos,
    anu.author_id
  from author_tokens at
  join author_name_unique anu
    on anu.normalized_name = at.normalized_token
  where anu.author_count = 1
),
author_unique as (
  select
    am.book_id,
    am.author_id,
    min(am.token_pos) as token_pos
  from author_matched am
  group by am.book_id, am.author_id
),
author_missing as (
  select
    au.book_id,
    au.author_id,
    au.token_pos
  from author_unique au
  left join public.library_book_authors lba
    on lba.book_id = au.book_id
   and lba.author_id = au.author_id
  where lba.book_id is null
),
author_default_state as (
  select
    lba.book_id,
    bool_or(lba.is_default) as has_default
  from public.library_book_authors lba
  group by lba.book_id
),
author_insert_rows as (
  select
    am.book_id,
    am.author_id,
    case
      when coalesce(ads.has_default, false) then false
      else row_number() over (partition by am.book_id order by am.token_pos, am.author_id) = 1
    end as is_default
  from author_missing am
  left join author_default_state ads
    on ads.book_id = am.book_id
)
insert into public.library_book_authors (book_id, author_id, is_default)
select
  air.book_id,
  air.author_id,
  air.is_default
from author_insert_rows air
on conflict (book_id, author_id) do nothing;

with artist_names as (
  select
    a.id as artist_id,
    lower(regexp_replace(btrim(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))), '\\s+', ' ', 'g')) as normalized_name
  from public.artists a
  union all
  select
    a.id as artist_id,
    lower(regexp_replace(btrim(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))), '\\s+', ' ', 'g')) as normalized_name
  from public.artists a
),
artist_name_unique as (
  select
    an.normalized_name,
    (array_agg(an.artist_id order by an.artist_id))[1] as artist_id,
    count(distinct an.artist_id) as artist_count
  from artist_names an
  group by an.normalized_name
),
artist_tokens as (
  select
    lb.id as book_id,
    t.ordinality as token_pos,
    lower(regexp_replace(btrim(t.token), '\\s+', ' ', 'g')) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(coalesce(lb.search_artist, ''), '[,;]') with ordinality as t(token, ordinality)
  where btrim(coalesce(lb.search_artist, '')) <> ''
    and btrim(t.token) <> ''
),
artist_matched as (
  select
    at.book_id,
    at.token_pos,
    anu.artist_id
  from artist_tokens at
  join artist_name_unique anu
    on anu.normalized_name = at.normalized_token
  where anu.artist_count = 1
),
artist_unique as (
  select
    am.book_id,
    am.artist_id,
    min(am.token_pos) as token_pos
  from artist_matched am
  group by am.book_id, am.artist_id
),
artist_missing as (
  select
    au.book_id,
    au.artist_id,
    au.token_pos
  from artist_unique au
  left join public.library_book_artists lba
    on lba.book_id = au.book_id
   and lba.artist_id = au.artist_id
  where lba.book_id is null
),
artist_book_max as (
  select
    lba.book_id,
    max(lba.legacy_artist_no) as max_legacy_artist_no
  from public.library_book_artists lba
  group by lba.book_id
),
artist_default_state as (
  select
    lba.book_id,
    bool_or(lba.is_default) as has_default
  from public.library_book_artists lba
  group by lba.book_id
),
artist_insert_rows as (
  select
    am.book_id,
    am.artist_id,
    coalesce(abm.max_legacy_artist_no, 999999) + row_number() over (partition by am.book_id order by am.token_pos, am.artist_id) as legacy_artist_no,
    case
      when coalesce(ads.has_default, false) then false
      else row_number() over (partition by am.book_id order by am.token_pos, am.artist_id) = 1
    end as is_default
  from artist_missing am
  left join artist_book_max abm
    on abm.book_id = am.book_id
  left join artist_default_state ads
    on ads.book_id = am.book_id
)
insert into public.library_book_artists (book_id, artist_id, legacy_artist_no, is_default)
select
  air.book_id,
  air.artist_id,
  air.legacy_artist_no,
  air.is_default
from artist_insert_rows air
on conflict (book_id, legacy_artist_no) do nothing;