create or replace function public.normalize_person_name(input_value text)
returns text
language sql
immutable
set search_path = public
as $$
with normalized as (
  select lower(coalesce(input_value, '')) as value
),
folded as (
  select
    replace(
      replace(
        replace(
          replace(
            replace(value, '’', ' '),
            '''',
            ' '
          ),
          '-',
          ' '
        ),
        '&',
        ' et '
      ),
      '/',
      ' '
    ) as value
  from normalized
),
expanded as (
  select
    replace(replace(value, 'œ', 'oe'), 'æ', 'ae') as value
  from folded
),
accentless as (
  select
    translate(
      value,
      'àáâäãåāăąçćčďèéêëēĕėęěìíîïīįıñńňòóôöõōŏőùúûüūŭůűųýÿžźż',
      'aaaaaaaaacccdeeeeeeeeeiiiiiiinnnoooooooouuuuuuuuuyyzzz'
    ) as value
  from expanded
),
cleaned as (
  select regexp_replace(value, '[^a-z0-9 ]+', ' ', 'g') as value
  from accentless
),
single_spaced as (
  select regexp_replace(value, '\\s+', ' ', 'g') as value
  from cleaned
)
select nullif(btrim(value), '')
from single_spaced;
$$;

with author_names as (
  select
    a.id as author_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as normalized_name
  from public.library_authors a
  union all
  select
    a.id as author_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as normalized_name
  from public.library_authors a
),
author_name_unique as (
  select
    an.normalized_name,
    (array_agg(an.author_id order by an.author_id))[1] as author_id,
    count(distinct an.author_id) as author_count
  from author_names an
  where an.normalized_name is not null
  group by an.normalized_name
),
author_tokens as (
  select
    lb.id as book_id,
    t.ordinality as token_pos,
    public.normalize_person_name(t.token) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    coalesce(lb.search_author, ''),
    '(?i)\\s*(?:,|;|/|\\||\\+|&|\\bet\\b|\\band\\b)\\s*'
  ) with ordinality as t(token, ordinality)
),
author_matched as (
  select
    at.book_id,
    at.token_pos,
    anu.author_id
  from author_tokens at
  join author_name_unique anu
    on anu.normalized_name = at.normalized_token
  where at.normalized_token is not null
    and anu.author_count = 1
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
    public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as normalized_name
  from public.artists a
  union all
  select
    a.id as artist_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as normalized_name
  from public.artists a
),
artist_name_unique as (
  select
    an.normalized_name,
    (array_agg(an.artist_id order by an.artist_id))[1] as artist_id,
    count(distinct an.artist_id) as artist_count
  from artist_names an
  where an.normalized_name is not null
  group by an.normalized_name
),
artist_tokens as (
  select
    lb.id as book_id,
    t.ordinality as token_pos,
    public.normalize_person_name(t.token) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    coalesce(lb.search_artist, ''),
    '(?i)\\s*(?:,|;|/|\\||\\+|&|\\bet\\b|\\band\\b)\\s*'
  ) with ordinality as t(token, ordinality)
),
artist_matched as (
  select
    at.book_id,
    at.token_pos,
    anu.artist_id
  from artist_tokens at
  join artist_name_unique anu
    on anu.normalized_name = at.normalized_token
  where at.normalized_token is not null
    and anu.artist_count = 1
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
    public.normalize_person_name(t.token) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    coalesce(lb.search_author, ''),
    '(?i)\\s*(?:,|;|/|\\||\\+|&|\\bet\\b|\\band\\b)\\s*'
  ) with ordinality as t(token, ordinality)
  where btrim(t.token) <> ''
),
author_name_index as (
  select
    a.id as author_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as normalized_name
  from public.library_authors a
  union all
  select
    a.id as author_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as normalized_name
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
  where t.normalized_token is not null
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
  where t.normalized_token is not null
    and (
      t.normalized_token = public.normalize_person_name(concat_ws(' ', coalesce(la.first_name, ''), coalesce(la.last_name, '')))
      or t.normalized_token = public.normalize_person_name(concat_ws(' ', coalesce(la.last_name, ''), coalesce(la.first_name, '')))
    )
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
    public.normalize_person_name(t.token) as normalized_token
  from public.library_books lb
  cross join lateral regexp_split_to_table(
    coalesce(lb.search_artist, ''),
    '(?i)\\s*(?:,|;|/|\\||\\+|&|\\bet\\b|\\band\\b)\\s*'
  ) with ordinality as t(token, ordinality)
  where btrim(t.token) <> ''
),
artist_name_index as (
  select
    a.id as artist_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, ''))) as normalized_name
  from public.artists a
  union all
  select
    a.id as artist_id,
    public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, ''))) as normalized_name
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
  where t.normalized_token is not null
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
  where t.normalized_token is not null
    and (
      t.normalized_token = public.normalize_person_name(concat_ws(' ', coalesce(a.first_name, ''), coalesce(a.last_name, '')))
      or t.normalized_token = public.normalize_person_name(concat_ws(' ', coalesce(a.last_name, ''), coalesce(a.first_name, '')))
    )
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

grant execute on function public.normalize_person_name(text) to authenticated;
grant execute on function public.normalize_person_name(text) to service_role;

grant select on public.library_unresolved_authors to authenticated;
grant select on public.library_unresolved_artists_remaining to authenticated;
grant select on public.library_unresolved_people to authenticated;