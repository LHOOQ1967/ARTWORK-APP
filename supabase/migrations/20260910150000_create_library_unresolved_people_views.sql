create or replace view public.library_unresolved_authors
with (security_invoker = true) as
with author_tokens as (
  select
    lb.id as book_id,
    lb.legacy_no as book_legacy_no,
    lb.title as book_title,
    lb.entered_at,
    lb.search_author,
    lb.created_by,
    t.ordinality as token_pos,
    btrim(t.token) as legacy_author_name,
    lower(regexp_replace(btrim(t.token), '\\s+', ' ', 'g')) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(coalesce(lb.search_author, ''), '[,;]') with ordinality as t(token, ordinality)
  where btrim(coalesce(lb.search_author, '')) <> ''
    and btrim(t.token) <> ''
),
author_name_index as (
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
author_matches as (
  select
    t.book_id,
    t.token_pos,
    t.legacy_author_name,
    ani.author_id
  from author_tokens t
  left join author_name_index ani
    on ani.normalized_name = t.normalized_token
),
author_match_stats as (
  select
    am.book_id,
    am.token_pos,
    am.legacy_author_name,
    count(distinct am.author_id) filter (where am.author_id is not null) as candidate_count
  from author_matches am
  group by am.book_id, am.token_pos, am.legacy_author_name
),
author_candidate_names as (
  select
    am.book_id,
    am.token_pos,
    string_agg(distinct coalesce(nullif(btrim(concat_ws(' ', la.first_name, la.last_name)), ''), la.legacy_no::text), ', ' order by coalesce(nullif(btrim(concat_ws(' ', la.first_name, la.last_name)), ''), la.legacy_no::text)) as candidate_names
  from author_matches am
  join public.library_authors la on la.id = am.author_id
  group by am.book_id, am.token_pos
),
author_resolved_tokens as (
  select distinct
    t.book_id,
    t.token_pos
  from author_tokens t
  join public.library_book_authors lba on lba.book_id = t.book_id
  join public.library_authors la on la.id = lba.author_id
  where t.normalized_token = lower(regexp_replace(btrim(concat_ws(' ', coalesce(la.first_name, ''), coalesce(la.last_name, ''))), '\\s+', ' ', 'g'))
     or t.normalized_token = lower(regexp_replace(btrim(concat_ws(' ', coalesce(la.last_name, ''), coalesce(la.first_name, ''))), '\\s+', ' ', 'g'))
)
select
  t.book_id,
  t.book_legacy_no,
  t.book_title,
  t.entered_at,
  t.search_author,
  t.created_by,
  t.token_pos,
  t.legacy_author_name,
  coalesce(s.candidate_count, 0) as candidate_count,
  c.candidate_names,
  case
    when coalesce(s.candidate_count, 0) = 0 then 'no_match'
    when coalesce(s.candidate_count, 0) = 1 then 'unique_match_not_linked'
    else 'ambiguous_match'
  end as resolution_status
from author_tokens t
left join author_match_stats s
  on s.book_id = t.book_id
 and s.token_pos = t.token_pos
left join author_candidate_names c
  on c.book_id = t.book_id
 and c.token_pos = t.token_pos
left join author_resolved_tokens r
  on r.book_id = t.book_id
 and r.token_pos = t.token_pos
where r.book_id is null;

create or replace view public.library_unresolved_artists_remaining
with (security_invoker = true) as
with artist_tokens as (
  select
    lb.id as book_id,
    lb.legacy_no as book_legacy_no,
    lb.title as book_title,
    lb.entered_at,
    lb.search_artist,
    lb.created_by,
    t.ordinality as token_pos,
    btrim(t.token) as legacy_artist_name,
    lower(regexp_replace(btrim(t.token), '\\s+', ' ', 'g')) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(coalesce(lb.search_artist, ''), '[,;]') with ordinality as t(token, ordinality)
  where btrim(coalesce(lb.search_artist, '')) <> ''
    and btrim(t.token) <> ''
),
artist_name_index as (
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
artist_matches as (
  select
    t.book_id,
    t.token_pos,
    t.legacy_artist_name,
    ani.artist_id
  from artist_tokens t
  left join artist_name_index ani
    on ani.normalized_name = t.normalized_token
),
artist_match_stats as (
  select
    am.book_id,
    am.token_pos,
    am.legacy_artist_name,
    count(distinct am.artist_id) filter (where am.artist_id is not null) as candidate_count
  from artist_matches am
  group by am.book_id, am.token_pos, am.legacy_artist_name
),
artist_candidate_names as (
  select
    am.book_id,
    am.token_pos,
    string_agg(distinct coalesce(nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''), a.id::text), ', ' order by coalesce(nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''), a.id::text)) as candidate_names
  from artist_matches am
  join public.artists a on a.id = am.artist_id
  group by am.book_id, am.token_pos
),
artist_resolved_tokens as (
  select distinct
    t.book_id,
    t.token_pos
  from artist_tokens t
  join public.library_book_artists lba on lba.book_id = t.book_id and lba.artist_id is not null
  join public.artists a on a.id = lba.artist_id
  where t.normalized_token = lower(regexp_replace(btrim(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))), '\\s+', ' ', 'g'))
     or t.normalized_token = lower(regexp_replace(btrim(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))), '\\s+', ' ', 'g'))
)
select
  t.book_id,
  t.book_legacy_no,
  t.book_title,
  t.entered_at,
  t.search_artist,
  t.created_by,
  t.token_pos,
  t.legacy_artist_name,
  coalesce(s.candidate_count, 0) as candidate_count,
  c.candidate_names,
  case
    when coalesce(s.candidate_count, 0) = 0 then 'no_match'
    when coalesce(s.candidate_count, 0) = 1 then 'unique_match_not_linked'
    else 'ambiguous_match'
  end as resolution_status
from artist_tokens t
left join artist_match_stats s
  on s.book_id = t.book_id
 and s.token_pos = t.token_pos
left join artist_candidate_names c
  on c.book_id = t.book_id
 and c.token_pos = t.token_pos
left join artist_resolved_tokens r
  on r.book_id = t.book_id
 and r.token_pos = t.token_pos
where r.book_id is null;

create or replace view public.library_unresolved_people
with (security_invoker = true) as
select
  'author'::text as person_type,
  ua.book_id,
  ua.book_legacy_no,
  ua.book_title,
  ua.entered_at,
  ua.created_by,
  ua.token_pos,
  ua.legacy_author_name as legacy_name,
  ua.candidate_count,
  ua.candidate_names,
  ua.resolution_status
from public.library_unresolved_authors ua
union all
select
  'artist'::text as person_type,
  ua.book_id,
  ua.book_legacy_no,
  ua.book_title,
  ua.entered_at,
  ua.created_by,
  ua.token_pos,
  ua.legacy_artist_name as legacy_name,
  ua.candidate_count,
  ua.candidate_names,
  ua.resolution_status
from public.library_unresolved_artists_remaining ua;

grant select on public.library_unresolved_authors to authenticated;
grant select on public.library_unresolved_artists_remaining to authenticated;
grant select on public.library_unresolved_people to authenticated;