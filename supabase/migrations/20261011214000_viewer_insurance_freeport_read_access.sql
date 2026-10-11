CREATE POLICY geneva_freeport_inventory_viewer_read
  ON public.geneva_freeport_inventory FOR SELECT TO authenticated
  USING (security.can_view_artwork(artwork_id));

CREATE POLICY geneva_freeport_documents_viewer_read
  ON public.geneva_freeport_customs_documents FOR SELECT TO authenticated
  USING (security.can_view_artwork(artwork_id));

CREATE POLICY client_insurance_policies_viewer_read
  ON public.client_insurance_policies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_users cu
      JOIN public.contacts c ON c.id = cu.contact_id
      WHERE cu.user_id = (SELECT auth.uid())
        AND cu.contact_id = client_insurance_policies.client_id
        AND c.is_client
    )
  );
