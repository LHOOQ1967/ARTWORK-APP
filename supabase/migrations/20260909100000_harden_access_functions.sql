-- Access checks run in the caller's RLS context and do not need definer privileges.
alter function public.user_has_any_access()
  security invoker;

revoke execute on function public.user_has_any_access() from public;
revoke execute on function public.user_has_any_access() from anon;
grant execute on function public.user_has_any_access() to authenticated;

-- This duplicate legacy RPC is not used by the application.
revoke execute on function security.user_has_any_access() from public;
revoke execute on function security.user_has_any_access() from anon;
revoke execute on function security.user_has_any_access() from authenticated;