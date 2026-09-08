drop policy if exists buyer_search_requests_select on public.buyer_search_requests;

create policy buyer_search_requests_select_admin_editor
  on public.buyer_search_requests
  for select
  to authenticated
  using (security.is_admin_or_editor());