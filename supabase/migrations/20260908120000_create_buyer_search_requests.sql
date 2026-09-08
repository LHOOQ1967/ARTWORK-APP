create table public.buyer_search_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null default current_date,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  search text not null,
  budget text,
  status text not null default 'Open' check (status in ('Open', 'In progress', 'Found', 'Closed')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index buyer_search_requests_date_idx
  on public.buyer_search_requests (request_date desc);

create index buyer_search_requests_contact_id_idx
  on public.buyer_search_requests (contact_id);

alter table public.buyer_search_requests enable row level security;

create policy buyer_search_requests_select
  on public.buyer_search_requests
  for select
  to authenticated
  using (
    security.is_admin_or_editor()
    or security.has_contact_access(contact_id)
  );

create policy buyer_search_requests_insert_admin_editor
  on public.buyer_search_requests
  for insert
  to authenticated
  with check (security.is_admin_or_editor());

create policy buyer_search_requests_update_admin_editor
  on public.buyer_search_requests
  for update
  to authenticated
  using (security.is_admin_or_editor())
  with check (security.is_admin_or_editor());

create policy buyer_search_requests_delete_admin_editor
  on public.buyer_search_requests
  for delete
  to authenticated
  using (security.is_admin_or_editor());

grant select on public.buyer_search_requests to authenticated;
grant insert, update, delete on public.buyer_search_requests to authenticated;