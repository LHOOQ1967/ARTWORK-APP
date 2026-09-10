-- Distinguish imported books from newly created books using legacy_no ranges:
-- imported from Access keep existing numbers, new books use values starting at 1000000.
create sequence if not exists public.library_books_manual_legacy_no_seq
  as integer
  minvalue 1000000
  start with 1000000;

select setval(
  'public.library_books_manual_legacy_no_seq',
  greatest(
    coalesce((select max(legacy_no) + 1 from public.library_books), 1000000),
    1000000
  ),
  false
);

alter sequence public.library_books_manual_legacy_no_seq
  owned by public.library_books.legacy_no;

alter table public.library_books
  alter column legacy_no set default nextval('public.library_books_manual_legacy_no_seq');

grant usage, select on sequence public.library_books_manual_legacy_no_seq to authenticated;
