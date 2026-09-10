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
    public.normalize_person_name(t.token) as normalized_token,
    public.normalize_person_name_signature(t.token) as signature_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    regexp_replace(coalesce(lb.search_author, ''), '(^|[[:space:]])(et|and)([[:space:]]|$)', ',', 'gi'),
    '[,;/|+&]+'
  ) with ordinality as t(token, ordinality)
  where btrim(t.token) <> ''
),
token_keys as (
  select book_id, token_pos, legacy_author_name, normalized_token as match_key
  from author_tokens
  where normalized_token is not null
  union all
  select book_id, token_pos, legacy_author_name, signature_token as match_key
  from author_tokens
  where signature_token is not null
),
author_keys as (
  select distinct
    a.id as author_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as match_key
  from public.library_authors a
  union
  select distinct
    a.id as author_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as match_key
  from public.library_authors a
  union
  select distinct
    a.id as author_id,
    public.normalize_person_name_signature(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as match_key
  from public.library_authors a
  union
  select distinct
    a.id as author_id,
    public.normalize_person_name_signature(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as match_key
  from public.library_authors a
),
token_matches as (
  select distinct
    tk.book_id,
    tk.token_pos,
    tk.legacy_author_name,
    ak.author_id
  from token_keys tk
  join author_keys ak
    on ak.match_key = tk.match_key
),
author_match_stats as (
  select
    tm.book_id,
    tm.token_pos,
    tm.legacy_author_name,
    count(distinct tm.author_id) as candidate_count
  from token_matches tm
  group by tm.book_id, tm.token_pos, tm.legacy_author_name
),
author_resolved_tokens as (
  select distinct
    tm.book_id,
    tm.token_pos
  from token_matches tm
  join public.library_book_authors lba
    on lba.book_id = tm.book_id
   and lba.author_id = tm.author_id
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
  null::text as candidate_names,
  case
    when coalesce(s.candidate_count, 0) = 0 then 'no_match'
    when coalesce(s.candidate_count, 0) = 1 then 'unique_match_not_linked'
    else 'ambiguous_match'
  end as resolution_status
from author_tokens t
left join author_match_stats s
  on s.book_id = t.book_id
 and s.token_pos = t.token_pos
left join author_resolved_tokens r
  on r.book_id = t.book_id
 and r.token_pos = t.token_pos
where t.normalized_token is not null
  and r.book_id is null;

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
    public.normalize_person_name(t.token) as normalized_token,
    public.normalize_person_name_signature(t.token) as signature_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    regexp_replace(coalesce(lb.search_artist, ''), '(^|[[:space:]])(et|and)([[:space:]]|$)', ',', 'gi'),
    '[,;/|+&]+'
  ) with ordinality as t(token, ordinality)
  where btrim(t.token) <> ''
),
token_keys as (
  select book_id, token_pos, legacy_artist_name, normalized_token as match_key
  from artist_tokens
  where normalized_token is not null
  union all
  select book_id, token_pos, legacy_artist_name, signature_token as match_key
  from artist_tokens
  where signature_token is not null
),
artist_keys as (
  select distinct
    a.id as artist_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as match_key
  from public.artists a
  union
  select distinct
    a.id as artist_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as match_key
  from public.artists a
  union
  select distinct
    a.id as artist_id,
    public.normalize_person_name_signature(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as match_key
  from public.artists a
  union
  select distinct
    a.id as artist_id,
    public.normalize_person_name_signature(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as match_key
  from public.artists a
),
token_matches as (
  select distinct
    tk.book_id,
    tk.token_pos,
    tk.legacy_artist_name,
    ak.artist_id
  from token_keys tk
  join artist_keys ak
    on ak.match_key = tk.match_key
),
artist_match_stats as (
  select
    tm.book_id,
    tm.token_pos,
    tm.legacy_artist_name,
    count(distinct tm.artist_id) as candidate_count
  from token_matches tm
  group by tm.book_id, tm.token_pos, tm.legacy_artist_name
),
artist_resolved_tokens as (
  select distinct
    tm.book_id,
    tm.token_pos
  from token_matches tm
  join public.library_book_artists lba
    on lba.book_id = tm.book_id
   and lba.artist_id = tm.artist_id
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
  null::text as candidate_names,
  case
    when coalesce(s.candidate_count, 0) = 0 then 'no_match'
    when coalesce(s.candidate_count, 0) = 1 then 'unique_match_not_linked'
    else 'ambiguous_match'
  end as resolution_status
from artist_tokens t
left join artist_match_stats s
  on s.book_id = t.book_id
 and s.token_pos = t.token_pos
left join artist_resolved_tokens r
  on r.book_id = t.book_id
 and r.token_pos = t.token_pos
where t.normalized_token is not null
  and r.book_id is null;

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