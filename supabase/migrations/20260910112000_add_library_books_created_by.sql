alter table public.library_books
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists library_books_created_by_idx
  on public.library_books (created_by);
