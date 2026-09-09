-- Keep one SELECT policy per commission table so PostgreSQL does not evaluate
-- overlapping permissive policies for every read.

drop policy if exists artwork_commission_rates_select
  on public.artwork_commission_rates;
drop policy if exists artwork_commission_rates_viewer_select
  on public.artwork_commission_rates;
drop policy if exists artwork_commission_rates_write
  on public.artwork_commission_rates;

create policy artwork_commission_rates_select_authenticated
  on public.artwork_commission_rates
  for select
  to authenticated
  using (true);

create policy artwork_commission_rates_insert_admin_editor
  on public.artwork_commission_rates
  for insert
  to authenticated
  with check (security.is_admin_or_editor());

create policy artwork_commission_rates_update_admin_editor
  on public.artwork_commission_rates
  for update
  to authenticated
  using (security.is_admin_or_editor())
  with check (security.is_admin_or_editor());

create policy artwork_commission_rates_delete_admin_editor
  on public.artwork_commission_rates
  for delete
  to authenticated
  using (security.is_admin_or_editor());

drop policy if exists artwork_commission_invoices_editor_access
  on public.artwork_commission_invoices;
drop policy if exists artwork_commission_invoices_viewer_select
  on public.artwork_commission_invoices;
drop policy if exists artwork_commission_correction_invoices_editor_access
  on public.artwork_commission_correction_invoices;
drop policy if exists artwork_commission_correction_invoices_viewer_select
  on public.artwork_commission_correction_invoices;

create policy artwork_commission_invoices_select_authenticated
  on public.artwork_commission_invoices
  for select
  to authenticated
  using (true);

create policy artwork_commission_invoices_insert_admin_editor
  on public.artwork_commission_invoices
  for insert
  to authenticated
  with check (security.is_admin_or_editor());

create policy artwork_commission_invoices_update_admin_editor
  on public.artwork_commission_invoices
  for update
  to authenticated
  using (security.is_admin_or_editor())
  with check (security.is_admin_or_editor());

create policy artwork_commission_invoices_delete_admin_editor
  on public.artwork_commission_invoices
  for delete
  to authenticated
  using (security.is_admin_or_editor());

create policy artwork_commission_correction_invoices_select_authenticated
  on public.artwork_commission_correction_invoices
  for select
  to authenticated
  using (true);

create policy artwork_commission_correction_invoices_insert_admin_editor
  on public.artwork_commission_correction_invoices
  for insert
  to authenticated
  with check (security.is_admin_or_editor());

create policy artwork_commission_correction_invoices_update_admin_editor
  on public.artwork_commission_correction_invoices
  for update
  to authenticated
  using (security.is_admin_or_editor())
  with check (security.is_admin_or_editor());

create policy artwork_commission_correction_invoices_delete_admin_editor
  on public.artwork_commission_correction_invoices
  for delete
  to authenticated
  using (security.is_admin_or_editor());