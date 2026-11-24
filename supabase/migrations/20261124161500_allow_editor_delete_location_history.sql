-- Allow editors and administrators to delete erroneous location history rows
GRANT DELETE ON public.artwork_location_history TO authenticated;

CREATE POLICY artwork_location_history_delete
  ON public.artwork_location_history
  FOR DELETE TO authenticated
  USING (security.is_admin_or_editor());
