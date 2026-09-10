-- Definitive author backfill from legacy search_author into library_book_authors.
-- Safe to re-run: inserts only missing (book_id, author_id) pairs.

with author_keys as (
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
  union
  select distinct
    a.id as author_id,
    public.normalize_person_name_core_signature(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as match_key
  from public.library_authors a
  union
  select distinct
    a.id as author_id,
    public.normalize_person_name_core_signature(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as match_key
  from public.library_authors a
),
author_tokens as (
  select
    lb.id as book_id,
    t.ordinality as token_pos,
    btrim(t.token) as token,
    public.normalize_person_name(t.token) as normalized_token,
    public.normalize_person_name_signature(t.token) as signature_token,
    public.normalize_person_name_core_signature(t.token) as core_signature_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    regexp_replace(coalesce(lb.search_author, ''), '(^|[[:space:]])(et|and)([[:space:]]|$)', ',', 'gi'),
    '[,;/|+&]+'
  ) with ordinality as t(token, ordinality)
  where btrim(coalesce(lb.search_author, '')) <> ''
    and btrim(t.token) <> ''
),
token_keys as (
  select book_id, token_pos, normalized_token as match_key
  from author_tokens
  where normalized_token is not null
  union all
  select book_id, token_pos, signature_token as match_key
  from author_tokens
  where signature_token is not null
  union all
  select book_id, token_pos, core_signature_token as match_key
  from author_tokens
  where core_signature_token is not null
),
token_candidates as (
  select distinct
    tk.book_id,
    tk.token_pos,
    ak.author_id
  from token_keys tk
  join author_keys ak
    on ak.match_key = tk.match_key
),
token_candidate_stats as (
  select
    tc.book_id,
    tc.token_pos,
    count(distinct tc.author_id) as candidate_count,
    (array_agg(tc.author_id order by tc.author_id))[1] as chosen_author_id
  from token_candidates tc
  group by tc.book_id, tc.token_pos
),
unique_token_matches as (
  select
    tcs.book_id,
    tcs.token_pos,
    tcs.chosen_author_id as author_id
  from token_candidate_stats tcs
  where tcs.candidate_count = 1
),
unique_book_authors as (
  select
    utm.book_id,
    utm.author_id,
    min(utm.token_pos) as first_token_pos
  from unique_token_matches utm
  group by utm.book_id, utm.author_id
),
missing_links as (
  select
    uba.book_id,
    uba.author_id,
    uba.first_token_pos
  from unique_book_authors uba
  left join public.library_book_authors lba
    on lba.book_id = uba.book_id
   and lba.author_id = uba.author_id
  where lba.book_id is null
),
default_state as (
  select
    lba.book_id,
    bool_or(lba.is_default) as has_default,
    count(*) as existing_count
  from public.library_book_authors lba
  group by lba.book_id
),
insert_rows as (
  select
    ml.book_id,
    ml.author_id,
    case
      when coalesce(ds.has_default, false) then false
      else row_number() over (partition by ml.book_id order by ml.first_token_pos, ml.author_id) = 1
    end as is_default
  from missing_links ml
  left join default_state ds
    on ds.book_id = ml.book_id
)
insert into public.library_book_authors (book_id, author_id, is_default)
select
  ir.book_id,
  ir.author_id,
  ir.is_default
from insert_rows ir
on conflict (book_id, author_id) do nothing;