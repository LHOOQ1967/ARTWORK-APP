-- Index foreign-key columns used for joins and parent-row updates/deletes.
create index if not exists artwork_commission_rates_updated_by_idx
  on public.artwork_commission_rates (updated_by);

create index if not exists artwork_commission_invoices_created_by_idx
  on public.artwork_commission_invoices (created_by);

create index if not exists artwork_commission_correction_invoices_created_by_idx
  on public.artwork_commission_correction_invoices (created_by);

create index if not exists artwork_valuations_created_by_idx
  on public.artwork_valuations (created_by);

create index if not exists buyer_search_requests_created_by_idx
  on public.buyer_search_requests (created_by);

-- These single-column indexes are covered by the composite indexes below.
drop index if exists public.idx_contact_users_contact_id;
drop index if exists public.idx_contact_users_user_id;