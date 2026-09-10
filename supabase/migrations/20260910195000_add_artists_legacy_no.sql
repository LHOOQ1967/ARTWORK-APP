begin;

alter table public.artists
  add column if not exists legacy_no bigint;

create sequence if not exists public.artists_access_legacy_no_seq
  start with 1
  increment by 1;

create sequence if not exists public.artists_artmuse_legacy_no_seq
  start with 1000000
  increment by 1;

create or replace function public.assign_artist_legacy_no()
returns trigger
language plpgsql
as $$
begin
  if new.legacy_no is not null then
    return new;
  end if;

  if new.source = 'access_import' then
    new.legacy_no := nextval('public.artists_access_legacy_no_seq');
  else
    new.legacy_no := nextval('public.artists_artmuse_legacy_no_seq');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_artist_legacy_no on public.artists;

create trigger trg_set_artist_legacy_no
before insert on public.artists
for each row
execute function public.assign_artist_legacy_no();

with access_rows as (
  select
    id,
    row_number() over (order by created_at nulls last, id) as rn
  from public.artists
  where source = 'access_import'
),
manual_rows as (
  select
    id,
    1000000 + row_number() over (order by created_at nulls last, id) - 1 as rn
  from public.artists
  where source <> 'access_import'
)
update public.artists artist
set legacy_no = rows.rn
from access_rows rows
where artist.id = rows.id
  and artist.legacy_no is null;

with access_rows as (
  select
    id,
    row_number() over (order by created_at nulls last, id) as rn
  from public.artists
  where source = 'access_import'
),
manual_rows as (
  select
    id,
    1000000 + row_number() over (order by created_at nulls last, id) - 1 as rn
  from public.artists
  where source <> 'access_import'
)
update public.artists artist
set legacy_no = rows.rn
from manual_rows rows
where artist.id = rows.id
  and artist.legacy_no is null;

select setval(
  'public.artists_access_legacy_no_seq',
  greatest(
    1,
    coalesce((select max(legacy_no) from public.artists where source = 'access_import'), 0)
  )
);

select setval(
  'public.artists_artmuse_legacy_no_seq',
  greatest(
    1000000,
    coalesce((select max(legacy_no) from public.artists where source <> 'access_import'), 999999) + 1
  ) - 1
);

create unique index if not exists artists_legacy_no_uidx on public.artists (legacy_no);

alter table public.artists
  alter column legacy_no set not null;

alter sequence public.artists_access_legacy_no_seq
  owned by public.artists.legacy_no;

grant usage, select on sequence public.artists_access_legacy_no_seq to authenticated;
grant usage, select on sequence public.artists_artmuse_legacy_no_seq to authenticated;

commit;
