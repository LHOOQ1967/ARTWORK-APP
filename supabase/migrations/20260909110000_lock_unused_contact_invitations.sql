-- Legacy invitation records are not accessed by the application.
-- Keep the table available to service_role only and make the deny rule explicit.
revoke all on table public.contact_invitations from anon;
revoke all on table public.contact_invitations from authenticated;

create policy contact_invitations_deny_api_roles
  on public.contact_invitations
  for all
  to anon, authenticated
  using (false)
  with check (false);