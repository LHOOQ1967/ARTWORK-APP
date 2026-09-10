create or replace function public.library_book_types_default_type_number()
returns trigger
language plpgsql
as $$
begin
  new.type_number := new.legacy_no::text;

  return new;
end;
$$;

drop trigger if exists library_book_types_default_type_number on public.library_book_types;

create trigger library_book_types_default_type_number
before insert or update on public.library_book_types
for each row
execute function public.library_book_types_default_type_number();

update public.library_book_types
set type_number = legacy_no::text
where type_number is distinct from legacy_no::text;