alter table public.library_books
  add column if not exists cover_image_url text;
